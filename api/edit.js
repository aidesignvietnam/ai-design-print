import OpenAI from "openai";
import { toFile } from "openai/uploads";
import sharp from "sharp";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function sendJSON(res, status, data) {
  res.status(status).json(data);
}

function getRatio(width, height) {
  return Number(width) / Number(height);
}

function isUltraWide(width, height) {
  const ratio = getRatio(width, height);
  return ratio >= 3.0;
}

function isUltraTall(width, height) {
  const ratio = getRatio(width, height);
  return ratio <= 0.34;
}

function buildExpansionPrompt({
  direction,
  width,
  height,
  designType,
  style,
}) {
  const side = direction === "left" ? "LEFT" : "RIGHT";

  return `
You are expanding an existing professional advertising design.

TASK:
Create ONLY a natural visual continuation of the existing design toward the ${side} side.

IMPORTANT:
- This is a large-format advertising design.
- Target final physical size: ${width} × ${height} cm.
- Design type: ${designType || "advertising banner"}.
- Style: ${style || "professional"}.
- Continue the same background, lighting, colors, atmosphere, textures,
  architecture, decoration and visual environment from the supplied image.
- The new area must look like it was originally designed as part of the same artwork.
- Do NOT create a white area.
- Do NOT create a blank empty area.
- Do NOT add a border.
- Do NOT stretch the existing artwork.
- Do NOT distort people, products, objects, logos or typography.
- Do NOT invent a second copy of the main subject.
- Do NOT create duplicate people.
- Do NOT add new advertising text.
- Do NOT add random letters.
- Do NOT add watermarks.

The existing artwork is the central reference.
The new visual must connect naturally to its ${side} edge.

The purpose is seamless large-format print expansion.
Keep the visual density and professional advertising quality consistent
with the supplied artwork.

Generate a realistic continuation suitable for professional printing.
`;
}

async function generateExtension({
  imageBuffer,
  direction,
  width,
  height,
  designType,
  style,
}) {
  const imageFile = await toFile(
    imageBuffer,
    `reference-${direction}.png`,
    {
      type: "image/png",
    }
  );

  const prompt = buildExpansionPrompt({
    direction,
    width,
    height,
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

  const imageBase64 = result?.data?.[0]?.b64_json;

  if (!imageBase64) {
    throw new Error(
      `AI không trả về ảnh mở rộng phía ${direction}.`
    );
  }

  return Buffer.from(imageBase64, "base64");
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return sendJSON(res, 405, {
        error: "Method not allowed",
      });
    }

    const {
      image,
      targetWidth,
      targetHeight,
      width,
      height,
      unit,
      designType,
      style,
    } = req.body || {};

    if (!image) {
      return sendJSON(res, 400, {
        error: "Thiếu ảnh đầu vào.",
      });
    }

    const finalWidth = Number(targetWidth || width);
    const finalHeight = Number(targetHeight || height);

    if (
      !Number.isFinite(finalWidth) ||
      !Number.isFinite(finalHeight) ||
      finalWidth <= 0 ||
      finalHeight <= 0
    ) {
      return sendJSON(res, 400, {
        error: "Kích thước không hợp lệ.",
      });
    }

    const targetRatio = finalWidth / finalHeight;

    /*
     * Chuyển Data URL thành Buffer.
     */
    const base64Data = image.includes(",")
      ? image.split(",")[1]
      : image;

    const sourceBuffer = Buffer.from(base64Data, "base64");

    /*
     * Lấy thông tin ảnh gốc.
     */
    const sourceInfo = await sharp(sourceBuffer).metadata();

    const sourceWidth = sourceInfo.width;
    const sourceHeight = sourceInfo.height;

    if (!sourceWidth || !sourceHeight) {
      throw new Error("Không đọc được kích thước ảnh nguồn.");
    }

    /*
     * Nếu tỷ lệ không quá cực đoan,
     * chỉ tạo bản xuất đúng tỷ lệ bằng contain.
     */
    if (!isUltraWide(finalWidth, finalHeight) &&
        !isUltraTall(finalWidth, finalHeight)) {

      const outputBuffer = await sharp(sourceBuffer)
        .resize({
          width: 2400,
          height: Math.round(2400 / targetRatio),
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

      return sendJSON(res, 200, {
        image:
          "data:image/png;base64," +
          outputBuffer.toString("base64"),
        targetWidth: finalWidth,
        targetHeight: finalHeight,
        targetRatio,
        processed: false,
        method: "safe-contain",
      });
    }

    /*
     * ============================================================
     * ULTRA-WIDE / ULTRA-TALL
     * ============================================================
     *
     * Không kéo giãn ảnh gốc.
     *
     * Với banner cực rộng như 400 × 70,
     * ta tạo phần mở rộng AI riêng rồi ghép với artwork chính.
     */

    const horizontal = isUltraWide(finalWidth, finalHeight);

    if (horizontal) {
      /*
       * Artwork chính được giữ nguyên tỷ lệ.
       *
       * Chiều cao cuối cùng:
       * 420 px
       *
       * Chiều rộng artwork:
       * giữ theo tỷ lệ gốc.
       */
      const workingHeight = 420;

      const centerBuffer = await sharp(sourceBuffer)
        .resize({
          height: workingHeight,
          withoutEnlargement: false,
          fit: "inside",
        })
        .png()
        .toBuffer();

      const centerInfo = await sharp(centerBuffer).metadata();

      const centerWidth = centerInfo.width;

      /*
       * Tạo một vùng tham chiếu cho AI.
       *
       * AI sẽ được yêu cầu mở rộng artwork
       * về hai phía.
       */
      const leftExtension = await generateExtension({
        imageBuffer: sourceBuffer,
        direction: "left",
        width: finalWidth,
        height: finalHeight,
        designType,
        style,
      });

      const rightExtension = await generateExtension({
        imageBuffer: sourceBuffer,
        direction: "right",
        width: finalWidth,
        height: finalHeight,
        designType,
        style,
      });

      /*
       * Chuẩn hóa hai ảnh AI về cùng chiều cao.
       */
      const leftPrepared = await sharp(leftExtension)
        .resize({
          height: workingHeight,
          fit: "cover",
        })
        .png()
        .toBuffer();

      const rightPrepared = await sharp(rightExtension)
        .resize({
          height: workingHeight,
          fit: "cover",
        })
        .png()
        .toBuffer();

      const leftInfo = await sharp(leftPrepared).metadata();
      const rightInfo = await sharp(rightPrepared).metadata();

      /*
       * Chiều rộng cuối cùng.
       */
      const finalPixelWidth = 2400;
      const finalPixelHeight = Math.max(
        1,
        Math.round(finalPixelWidth / targetRatio)
      );

      /*
       * Artwork chính được đặt chính giữa.
       */
      const centerFinal = await sharp(centerBuffer)
        .resize({
          height: finalPixelHeight,
          fit: "inside",
        })
        .png()
        .toBuffer();

      const centerFinalInfo =
        await sharp(centerFinal).metadata();

      const actualCenterWidth = centerFinalInfo.width;

      /*
       * Hai bên chia đều phần còn lại.
       */
      const remaining =
        finalPixelWidth - actualCenterWidth;

      const sideWidth = Math.floor(remaining / 2);

      /*
       * Chuẩn bị phần AI bên trái.
       */
      const leftFinal = await sharp(leftPrepared)
        .resize({
          width: sideWidth,
          height: finalPixelHeight,
          fit: "cover",
          position: "right",
        })
        .png()
        .toBuffer();

      /*
       * Chuẩn bị phần AI bên phải.
       */
      const rightFinal = await sharp(rightPrepared)
        .resize({
          width:
            finalPixelWidth -
            actualCenterWidth -
            sideWidth,
          height: finalPixelHeight,
          fit: "cover",
          position: "left",
        })
        .png()
        .toBuffer();

      /*
       * Ghép:
       *
       * AI LEFT
       * +
       * ORIGINAL CENTER
       * +
       * AI RIGHT
       *
       * Không kéo giãn artwork chính.
       */
      const finalBuffer = await sharp({
        create: {
          width: finalPixelWidth,
          height: finalPixelHeight,
          channels: 4,
          background: {
            r: 255,
            g: 255,
            b: 255,
            alpha: 1,
          },
        },
      })
        .composite([
          {
            input: leftFinal,
            left: 0,
            top: 0,
          },
          {
            input: centerFinal,
            left: sideWidth,
            top: 0,
          },
          {
            input: rightFinal,
            left:
              sideWidth + actualCenterWidth,
            top: 0,
          },
        ])
        .png()
        .toBuffer();

      return sendJSON(res, 200, {
        image:
          "data:image/png;base64," +
          finalBuffer.toString("base64"),
        targetWidth: finalWidth,
        targetHeight: finalHeight,
        targetRatio,
        sourceWidth,
        sourceHeight,
        finalWidthPx: finalPixelWidth,
        finalHeightPx: finalPixelHeight,
        processed: true,
        method: "ai-side-expansion",
        direction: "horizontal",
      });
    }

    /*
     * ============================================================
     * ULTRA-TALL
     * ============================================================
     *
     * Tương tự nhưng mở rộng trên / dưới.
     */
    const workingWidth = 420;

    const centerBuffer = await sharp(sourceBuffer)
      .resize({
        width: workingWidth,
        fit: "inside",
      })
      .png()
      .toBuffer();

    const topExtension = await generateExtension({
      imageBuffer: sourceBuffer,
      direction: "left",
      width: finalWidth,
      height: finalHeight,
      designType,
      style,
    });

    const bottomExtension = await generateExtension({
      imageBuffer: sourceBuffer,
      direction: "right",
      width: finalWidth,
      height: finalHeight,
      designType,
      style,
    });

    const finalPixelHeight = 2400;
    const finalPixelWidth = Math.max(
      1,
      Math.round(finalPixelHeight * targetRatio)
    );

    const centerFinal = await sharp(centerBuffer)
      .resize({
        width: finalPixelWidth,
        fit: "inside",
      })
      .png()
      .toBuffer();

    const centerInfo = await sharp(centerFinal).metadata();

    const actualCenterHeight = centerInfo.height;

    const remaining =
      finalPixelHeight - actualCenterHeight;

    const sideHeight = Math.floor(remaining / 2);

    const topFinal = await sharp(topExtension)
      .resize({
        width: finalPixelWidth,
        height: sideHeight,
        fit: "cover",
        position: "bottom",
      })
      .png()
      .toBuffer();

    const bottomFinal = await sharp(bottomExtension)
      .resize({
        width: finalPixelWidth,
        height:
          finalPixelHeight -
          actualCenterHeight -
          sideHeight,
        fit: "cover",
        position: "top",
      })
      .png()
      .toBuffer();

    const finalBuffer = await sharp({
      create: {
        width: finalPixelWidth,
        height: finalPixelHeight,
        channels: 4,
        background: {
          r: 255,
          g: 255,
          b: 255,
          alpha: 1,
        },
      },
    })
      .composite([
        {
          input: topFinal,
          left: 0,
          top: 0,
        },
        {
          input: centerFinal,
          left:
            Math.floor(
              (finalPixelWidth - centerInfo.width) / 2
            ),
          top: sideHeight,
        },
        {
          input: bottomFinal,
          left: 0,
          top:
            sideHeight + actualCenterHeight,
        },
      ])
      .png()
      .toBuffer();

    return sendJSON(res, 200, {
      image:
        "data:image/png;base64," +
        finalBuffer.toString("base64"),
      targetWidth: finalWidth,
      targetHeight: finalHeight,
      targetRatio,
      sourceWidth,
      sourceHeight,
      finalWidthPx: finalPixelWidth,
      finalHeightPx: finalPixelHeight,
      processed: true,
      method: "ai-side-expansion",
      direction: "vertical",
    });
  } catch (error) {
    console.error("EDIT ERROR:", error);

    return sendJSON(res, 500, {
      error:
        error?.message ||
        "Không thể xử lý mở rộng ảnh.",
    });
  }
}
