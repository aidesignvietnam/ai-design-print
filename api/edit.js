import OpenAI from "openai";
import sharp from "sharp";
import { toFile } from "openai/uploads";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function json(res, status, data) {
  return res.status(status).json(data);
}

function getRatio(width, height) {
  return Number(width) / Number(height);
}

function getTargetPixelSize(width, height) {
  const ratio = getRatio(width, height);

  /*
   * Dùng chiều rộng 1536px làm chuẩn.
   * Chiều cao được tính chính xác theo tỷ lệ người dùng nhập.
   *
   * Ví dụ:
   * 400 x 70
   * 1536 / 5.714 = khoảng 269px
   */
  const targetWidth = 1536;
  const targetHeight = Math.max(
    128,
    Math.round(targetWidth / ratio)
  );

  return {
    width: targetWidth,
    height: targetHeight,
  };
}

function getExtensionPrompt({
  width,
  height,
  unit,
  designType,
  style,
  content,
}) {
  const ratio = getRatio(width, height);

  return `
You are an expert large-format advertising designer.

We are preparing artwork for:

${width} ${unit} × ${height} ${unit}

Aspect ratio:
${ratio.toFixed(3)} : 1

Design type:
${designType || "Banner"}

Style:
${style || "Hiện đại"}

Design brief:
${content || "Professional advertising design."}

IMPORTANT:

This artwork will be printed as a very wide advertising banner.

The final composition must look like ONE continuous design.

Do NOT:
- duplicate people
- duplicate products
- duplicate logos
- duplicate text
- duplicate the main subject
- create three panels
- create a triptych
- mirror the design
- repeat the same design
- create a central frame
- create a mockup
- create a billboard mockup
- create a wall
- create empty white panels

The important advertising subject must remain visually coherent.

Any additional visual space should be natural continuation
of the original environment.

Extend:
- background
- lighting
- gradients
- scenery
- architecture
- decorative elements
- atmosphere
- textures

Do not invent another copy of the main subject.

The result must feel like one professionally art-directed
large-format advertising artwork.

Do not stretch people.

Do not stretch products.

Do not distort logos.

Do not distort important typography.

Keep the main advertising message readable.

Generate flat advertising artwork only.
`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return json(res, 405, {
        error: "Method not allowed",
      });
    }

    const body = req.body || {};

    const sourceImage = body.image;

    const width = Number(
      body.targetWidth || body.width
    );

    const height = Number(
      body.targetHeight || body.height
    );

    const unit = body.unit || "cm";

    const designType =
      body.designType || "Banner";

    const style =
      body.style || "Hiện đại";

    const content =
      body.content ||
      body.prompt ||
      body.editPrompt ||
      "Thiết kế quảng cáo chuyên nghiệp.";

    if (!sourceImage) {
      return json(res, 400, {
        error: "Không nhận được ảnh cần xử lý.",
      });
    }

    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return json(res, 400, {
        error:
          "Kích thước thiết kế không hợp lệ.",
      });
    }

    /*
     * --------------------------------------------------
     * 1. Đọc ảnh gốc
     * --------------------------------------------------
     */

    let base64Image = sourceImage;

    if (base64Image.includes(",")) {
      base64Image =
        base64Image.split(",")[1];
    }

    const originalBuffer =
      Buffer.from(base64Image, "base64");

    const originalMeta =
      await sharp(originalBuffer).metadata();

    const originalWidth =
      originalMeta.width || 1536;

    const originalHeight =
      originalMeta.height || 1024;

    /*
     * --------------------------------------------------
     * 2. Tính tỷ lệ đích
     * --------------------------------------------------
     */

    const target =
      getTargetPixelSize(width, height);

    const targetRatio =
      target.width / target.height;

    console.log(
      "AI DESIGN PRINT ASPECT PROCESS:",
      {
        physicalWidth: width,
        physicalHeight: height,
        unit,
        originalWidth,
        originalHeight,
        targetWidth: target.width,
        targetHeight: target.height,
        targetRatio,
      }
    );

    /*
     * --------------------------------------------------
     * 3. Với tỷ lệ bình thường:
     *    chỉ crop nhẹ nếu cần.
     * --------------------------------------------------
     */

    const originalRatio =
      originalWidth / originalHeight;

    /*
     * Nếu ảnh đã gần đúng tỷ lệ,
     * không cần AI chỉnh sửa.
     */
    if (
      Math.abs(
        originalRatio - targetRatio
      ) < 0.08
    ) {
      const output =
        await sharp(originalBuffer)
          .resize(
            target.width,
            target.height,
            {
              fit: "cover",
              position: "centre",
            }
          )
          .png()
          .toBuffer();

      return json(res, 200, {
        image:
          "data:image/png;base64," +
          output.toString("base64"),

        width,
        height,
        unit,

        targetRatio,

        outputWidth: target.width,
        outputHeight: target.height,

        method: "DIRECT_ASPECT",

        promptVersion:
          "AI-DESIGN-PRINT-ASPECT-V1",
      });
    }

    /*
     * --------------------------------------------------
     * 4. Tạo artwork chuẩn bị cho việc mở rộng.
     *
     * Không resize méo ảnh.
     *
     * Ảnh gốc được thu nhỏ theo chiều cao mục tiêu
     * để giữ nguyên tỷ lệ.
     * --------------------------------------------------
     */

    const fitted =
      await sharp(originalBuffer)
        .resize({
          height: target.height,
          withoutEnlargement: false,
        })
        .png()
        .toBuffer();

    const fittedMeta =
      await sharp(fitted).metadata();

    const fittedWidth =
      fittedMeta.width || target.width;

    /*
     * Nếu ảnh sau khi thu nhỏ đã rộng hơn
     * vùng đích thì crop trung tâm.
     */
    if (fittedWidth >= target.width) {
      const output =
        await sharp(fitted)
          .resize({
            width: target.width,
            height: target.height,
            fit: "cover",
            position: "centre",
          })
          .png()
          .toBuffer();

      return json(res, 200, {
        image:
          "data:image/png;base64," +
          output.toString("base64"),

        width,
        height,
        unit,

        targetRatio,

        outputWidth: target.width,
        outputHeight: target.height,

        method: "CENTER_CROP",

        promptVersion:
          "AI-DESIGN-PRINT-ASPECT-V1",
      });
    }

    /*
     * --------------------------------------------------
     * 5. Tạo nền mở rộng.
     *
     * Quan trọng:
     * Không ghép 3 bản sao của artwork.
     *
     * Chúng ta chỉ tạo background mở rộng,
     * sau đó đặt artwork gốc ở giữa.
     * --------------------------------------------------
     */

    const extensionPrompt =
      getExtensionPrompt({
        width,
        height,
        unit,
        designType,
        style,
        content,
      });

    /*
     * Tạo canvas trung gian theo tỷ lệ landscape
     * mà API hỗ trợ.
     *
     * Ảnh này dùng để tạo nền mở rộng tự nhiên.
     */

    const backgroundResponse =
      await openai.images.generate({
        model: "gpt-image-2",
        prompt: extensionPrompt,
        size: "1536x1024",
        quality: "high",
      });

    const backgroundBase64 =
      backgroundResponse?.data?.[0]?.b64_json;

    if (!backgroundBase64) {
      throw new Error(
        "AI không trả về nền mở rộng."
      );
    }

    const backgroundBuffer =
      Buffer.from(
        backgroundBase64,
        "base64"
      );

    /*
     * --------------------------------------------------
     * 6. Chuẩn hóa background về kích thước đích.
     *
     * Không kéo méo artwork gốc.
     * --------------------------------------------------
     */

    const background =
      await sharp(backgroundBuffer)
        .resize(
          target.width,
          target.height,
          {
            fit: "cover",
            position: "centre",
          }
        )
        .png()
        .toBuffer();

    /*
     * --------------------------------------------------
     * 7. Đặt artwork chính ở giữa.
     *
     * Chỉ một bản duy nhất.
     * --------------------------------------------------
     */

    const left =
      Math.max(
        0,
        Math.round(
          (target.width - fittedWidth) / 2
        )
      );

    const finalImage =
      await sharp(background)
        .composite([
          {
            input: fitted,
            left,
            top: 0,
          },
        ])
        .png()
        .toBuffer();

    /*
     * --------------------------------------------------
     * 8. Kiểm tra kích thước cuối cùng.
     * --------------------------------------------------
     */

    const finalMeta =
      await sharp(finalImage).metadata();

    return json(res, 200, {
      image:
        "data:image/png;base64," +
        finalImage.toString("base64"),

      width,
      height,
      unit,

      targetRatio,

      outputWidth:
        finalMeta.width,

      outputHeight:
        finalMeta.height,

      method:
        "AI_BACKGROUND_EXTENSION",

      promptVersion:
        "AI-DESIGN-PRINT-ASPECT-V1",
    });

  } catch (error) {
    console.error(
      "ASPECT PROCESS ERROR:",
      error
    );

    return json(res, 500, {
      error:
        error?.message ||
        "Không thể xử lý tỷ lệ ảnh.",
    });
  }
}
