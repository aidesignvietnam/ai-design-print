import OpenAI from "openai";
import { toFile } from "openai/uploads";
import sharp from "sharp";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function json(res, status, data) {
  return res.status(status).json(data);
}

function getRatio(width, height) {
  return Number(width) / Number(height);
}

function isExtremeRatio(width, height) {
  const ratio = getRatio(width, height);

  return ratio >= 2.5 || ratio <= 0.4;
}

/*
 * Tạo prompt cho AI mở rộng một BỐI CẢNH duy nhất.
 *
 * Mục tiêu:
 * - Không nhân bản nội dung chính.
 * - Không tạo người/sản phẩm/chữ mới.
 * - Không chia ảnh thành 3 phần.
 * - Chỉ mở rộng không gian nền.
 */
function buildPrompt({
  targetWidth,
  targetHeight,
  designType,
  style,
}) {
  const ratio = getRatio(targetWidth, targetHeight);

  return `
You are preparing a professional large-format advertising design.

TARGET PHYSICAL SIZE:
${targetWidth} × ${targetHeight} cm

TARGET ASPECT RATIO:
${ratio.toFixed(3)} : 1

DESIGN TYPE:
${designType || "Advertising banner"}

STYLE:
${style || "Professional"}

IMPORTANT:

The supplied image contains the MAIN ADVERTISING CONTENT.

Keep the main advertising content as ONE SINGLE composition.

DO NOT duplicate the main content.

DO NOT create a second copy of:
- people
- products
- logos
- signs
- typography
- objects
- characters
- vehicles
- furniture
- important foreground elements

DO NOT divide the composition into three repeated sections.

DO NOT mirror the image.

DO NOT tile the image.

DO NOT repeat the same scene.

DO NOT stretch the original artwork.

Instead, imagine that the original design exists in a much larger physical advertising environment.

Extend the surrounding BACKGROUND naturally so that the final artwork can fit the extremely wide target format.

The extension should contain only compatible environmental elements such as:
- background color
- gradients
- light
- shadows
- texture
- abstract shapes
- architectural environment
- decorative elements
- atmospheric depth
- subtle patterns

The original main advertising content must remain visually dominant and appear only ONCE.

The extended background must visually belong to the same original design.

The transition between the original artwork and the expanded background must be natural and seamless.

Do NOT create white empty areas.

Do NOT create artificial borders.

Do NOT add new advertising text.

Do NOT invent new slogans.

Do NOT add watermarks.

This is for professional large-format printing.

The final result should look like ONE intentionally designed advertising banner, not three images joined together.
`;
}

async function createExpandedBackground({
  sourceBuffer,
  targetWidth,
  targetHeight,
  designType,
  style,
}) {
  const imageFile = await toFile(
    sourceBuffer,
    "original-design.png",
    {
      type: "image/png",
    }
  );

  const prompt = buildPrompt({
    targetWidth,
    targetHeight,
    designType,
    style,
  });

  const result = await openai.images.edit({
    model: "gpt-image-2",
    image: imageFile,
    prompt,
    size: "1536x1024",
    quality: "high",
  });

  const b64 = result?.data?.[0]?.b64_json;

  if (!b64) {
    throw new Error("AI không trả về ảnh mở rộng.");
  }

  return Buffer.from(b64, "base64");
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return json(res, 405, {
        error: "Method not allowed",
      });
    }

    const body = req.body || {};

    const image = body.image;

    const targetWidth = Number(
      body.targetWidth || body.width
    );

    const targetHeight = Number(
      body.targetHeight || body.height
    );

    const designType = body.designType || "Advertising";
    const style = body.style || "Professional";

    if (!image) {
      return json(res, 400, {
        error: "Thiếu ảnh thiết kế.",
      });
    }

    if (
      !Number.isFinite(targetWidth) ||
      !Number.isFinite(targetHeight) ||
      targetWidth <= 0 ||
      targetHeight <= 0
    ) {
      return json(res, 400, {
        error: "Kích thước thiết kế không hợp lệ.",
      });
    }

    const targetRatio =
      targetWidth / targetHeight;

    /*
     * Chuyển Data URL thành Buffer.
     */
    const base64 = image.includes(",")
      ? image.split(",")[1]
      : image;

    const sourceBuffer =
      Buffer.from(base64, "base64");

    const sourceInfo =
      await sharp(sourceBuffer).metadata();

    const sourceWidth = sourceInfo.width;
    const sourceHeight = sourceInfo.height;

    if (!sourceWidth || !sourceHeight) {
      throw new Error(
        "Không đọc được kích thước ảnh nguồn."
      );
    }

    /*
     * ---------------------------------------------------------
     * TRƯỜNG HỢP KHÔNG CỰC RỘNG
     * ---------------------------------------------------------
     */
    if (
      !isExtremeRatio(
        targetWidth,
        targetHeight
      )
    ) {
      const finalWidth = 2400;

      const finalHeight = Math.max(
        1,
        Math.round(
          finalWidth / targetRatio
        )
      );

      const finalBuffer = await sharp(
        sourceBuffer
      )
        .resize({
          width: finalWidth,
          height: finalHeight,
          fit: "contain",
          background: {
            r: 255,
            g: 255,
            b: 255,
            alpha: 1,
          },
        })
        .png()
        .toBuffer();

      return json(res, 200, {
        image:
          "data:image/png;base64," +
          finalBuffer.toString("base64"),

        targetWidth,
        targetHeight,
        targetRatio,

        sourceWidth,
        sourceHeight,

        finalWidthPx: finalWidth,
        finalHeightPx: finalHeight,

        processed: false,
        method: "normal-ratio",
      });
    }

    /*
     * ---------------------------------------------------------
     * TRƯỜNG HỢP SIÊU RỘNG / SIÊU CAO
     * ---------------------------------------------------------
     *
     * Không còn:
     *
     * LEFT + CENTER + RIGHT
     *
     * nữa.
     *
     * AI được yêu cầu tạo một bối cảnh mở rộng
     * duy nhất.
     */

    const expandedBuffer =
      await createExpandedBackground({
        sourceBuffer,
        targetWidth,
        targetHeight,
        designType,
        style,
      });

    /*
     * Kích thước làm việc.
     *
     * 400 × 70
     *
     * sẽ trở thành:
     *
     * 2400 × 420
     *
     * đúng tỷ lệ.
     */
    const finalWidth = 2400;

    const finalHeight = Math.max(
      1,
      Math.round(
        finalWidth / targetRatio
      )
    );

    /*
     * ---------------------------------------------------------
     * Chuẩn hóa ảnh AI về cùng tỷ lệ mục tiêu.
     * ---------------------------------------------------------
     */
    const aiCanvas = await sharp(
      expandedBuffer
    )
      .resize({
        width: finalWidth,
        height: finalHeight,
        fit: "cover",
        position: "centre",
      })
      .png()
      .toBuffer();

    /*
     * ---------------------------------------------------------
     * Chuẩn hóa artwork gốc.
     *
     * Giữ nguyên tỷ lệ.
     * KHÔNG kéo méo.
     */
    const sourceMaxWidth =
      Math.round(finalWidth * 0.42);

    const sourcePrepared =
      await sharp(sourceBuffer)
        .resize({
          width: sourceMaxWidth,
          height: finalHeight,
          fit: "inside",
        })
        .png()
        .toBuffer();

    const preparedInfo =
      await sharp(sourcePrepared).metadata();

    const contentWidth =
      preparedInfo.width || sourceMaxWidth;

    const contentHeight =
      preparedInfo.height || finalHeight;

    /*
     * ---------------------------------------------------------
     * Tạo vùng trung tâm mềm.
     *
     * Artwork chính chỉ xuất hiện MỘT LẦN.
     */
    const centerX = Math.round(
      (finalWidth - contentWidth) / 2
    );

    const centerY = Math.round(
      (finalHeight - contentHeight) / 2
    );

    /*
     * Ghép artwork chính lên BỐI CẢNH AI DUY NHẤT.
     *
     * AI background phủ toàn bộ 400 × 70.
     *
     * Artwork chính nằm giữa.
     */
    const finalBuffer =
      await sharp(aiCanvas)
        .composite([
          {
            input: sourcePrepared,
            left: centerX,
            top: centerY,
          },
        ])
        .png()
        .toBuffer();

    /*
     * Kiểm tra lại kích thước cuối.
     */
    const finalInfo =
      await sharp(finalBuffer).metadata();

    return json(res, 200, {
      image:
        "data:image/png;base64," +
        finalBuffer.toString("base64"),

      targetWidth,
      targetHeight,
      targetRatio,

      sourceWidth,
      sourceHeight,

      finalWidthPx:
        finalInfo.width || finalWidth,

      finalHeightPx:
        finalInfo.height || finalHeight,

      processed: true,

      method:
        "single-ai-expanded-background",

      contentDuplicated: false,

      message:
        "Đã tạo nền mở rộng AI duy nhất và giữ nội dung chính ở trung tâm.",
    });
  } catch (error) {
    console.error(
      "AI DESIGN PRINT EDIT ERROR:",
      error
    );

    return json(res, 500, {
      error:
        error?.message ||
        "Không thể xử lý thiết kế.",
    });
  }
}
