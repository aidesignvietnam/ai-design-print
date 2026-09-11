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

function getTargetSize(width, height) {
  const ratio = getRatio(width, height);

  const targetWidth = 1536;
  const targetHeight = Math.max(
    256,
    Math.round(targetWidth / ratio)
  );

  return {
    width: targetWidth,
    height: targetHeight,
  };
}

function buildPrompt({
  width,
  height,
  unit,
  designType,
  style,
  content,
}) {
  const ratio = getRatio(width, height);

  return `
You are editing an existing professional advertising artwork.

TARGET PRINT FORMAT:
${width} ${unit} × ${height} ${unit}

TARGET ASPECT RATIO:
${ratio.toFixed(3)} : 1

DESIGN TYPE:
${designType || "Banner"}

STYLE:
${style || "Hiện đại"}

DESIGN BRIEF:
${content || "Professional advertising design."}

TASK:

Extend the existing artwork naturally into the masked areas.

The existing artwork contains the important advertising
content and must remain visually coherent.

DO NOT redesign the existing artwork.

DO NOT create a second version of the artwork.

DO NOT duplicate the main subject.

DO NOT duplicate people.

DO NOT duplicate products.

DO NOT duplicate logos.

DO NOT duplicate typography.

DO NOT create three panels.

DO NOT create a triptych.

DO NOT mirror the original design.

DO NOT create a central frame.

DO NOT create a border.

DO NOT create a mockup.

DO NOT create a wall or billboard presentation.

The masked areas should become a natural continuation of
the existing visual environment.

Continue compatible:
- background
- lighting
- gradients
- scenery
- architecture
- textures
- decorative elements
- atmosphere

Preserve the original advertising concept.

The main subject should appear only once.

The final result must look like ONE continuous professional
large-format advertising artwork.

Do not stretch people.

Do not stretch products.

Do not distort important objects.

Do not add unrelated text.

Do not add watermarks.

The result will be printed as a large-format advertising banner.
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
          "Chiều rộng và chiều cao không hợp lệ.",
      });
    }

    const target = getTargetSize(
      width,
      height
    );

    let base64 = sourceImage;

    if (base64.includes(",")) {
      base64 = base64.split(",")[1];
    }

    const originalBuffer =
      Buffer.from(base64, "base64");

    const originalMeta =
      await sharp(originalBuffer).metadata();

    const originalWidth =
      originalMeta.width || 1536;

    const originalHeight =
      originalMeta.height || 1024;

    const originalRatio =
      originalWidth / originalHeight;

    const targetRatio =
      target.width / target.height;

    console.log(
      "ASPECT EDIT REQUEST",
      {
        physicalWidth: width,
        physicalHeight: height,
        unit,
        originalWidth,
        originalHeight,
        originalRatio,
        targetWidth: target.width,
        targetHeight: target.height,
        targetRatio,
      }
    );

    /*
     * ------------------------------------------------
     * Tạo canvas đúng tỷ lệ.
     *
     * Ảnh gốc được đặt vào giữa nhưng KHÔNG kéo méo.
     * Phần còn thiếu trở thành vùng cần AI mở rộng.
     * ------------------------------------------------
     */

    const fitted =
      await sharp(originalBuffer)
        .resize({
          width: Math.min(
            originalWidth,
            target.width
          ),
          height: Math.min(
            originalHeight,
            target.height
          ),
          fit: "inside",
          withoutEnlargement: false,
        })
        .png()
        .toBuffer();

    const fittedMeta =
      await sharp(fitted).metadata();

    const fittedWidth =
      fittedMeta.width || originalWidth;

    const fittedHeight =
      fittedMeta.height || originalHeight;

    /*
     * Canvas trong suốt.
     */

    const canvas =
      await sharp({
        create: {
          width: target.width,
          height: target.height,
          channels: 4,
          background: {
            r: 0,
            g: 0,
            b: 0,
            alpha: 0,
          },
        },
      })
        .composite([
          {
            input: fitted,
            left: Math.round(
              (target.width - fittedWidth) / 2
            ),
            top: Math.round(
              (target.height - fittedHeight) / 2
            ),
          },
        ])
        .png()
        .toBuffer();

    /*
     * ------------------------------------------------
     * Mask:
     *
     * Trắng = vùng AI được phép mở rộng.
     * Đen = vùng artwork gốc cần bảo vệ.
     * ------------------------------------------------
     */

    const left =
      Math.round(
        (target.width - fittedWidth) / 2
      );

    const top =
      Math.round(
        (target.height - fittedHeight) / 2
      );

    const mask =
      await sharp({
        create: {
          width: target.width,
          height: target.height,
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
            input: await sharp({
              create: {
                width: fittedWidth,
                height: fittedHeight,
                channels: 4,
                background: {
                  r: 0,
                  g: 0,
                  b: 0,
                  alpha: 1,
                },
              },
            })
              .png()
              .toBuffer(),

            left,
            top,
          },
        ])
        .png()
        .toBuffer();

    /*
     * ------------------------------------------------
     * Gửi canvas + mask cho GPT-Image-2.
     * ------------------------------------------------
     */

    const imageFile = await toFile(
      canvas,
      "canvas.png",
      {
        type: "image/png",
      }
    );

    const maskFile = await toFile(
      mask,
      "mask.png",
      {
        type: "image/png",
      }
    );

    const prompt =
      buildPrompt({
        width,
        height,
        unit,
        designType,
        style,
        content,
      });

    const response =
      await openai.images.edit({
        model: "gpt-image-2",

        image: imageFile,

        mask: maskFile,

        prompt,

        size: "auto",

        quality: "high",

        output_format: "png",
      });

    const result =
      response?.data?.[0]?.b64_json;

    if (!result) {
      throw new Error(
        "AI không trả về ảnh mở rộng."
      );
    }

    const resultBuffer =
      Buffer.from(
        result,
        "base64"
      );

    /*
     * ------------------------------------------------
     * Chuẩn hóa kích thước cuối cùng.
     *
     * Không dùng cover/stretch.
     * Chỉ resize về đúng canvas đã yêu cầu.
     * ------------------------------------------------
     */

    const finalImage =
      await sharp(resultBuffer)
        .resize(
          target.width,
          target.height,
          {
            fit: "fill",
          }
        )
        .png()
        .toBuffer();

    const finalMeta =
      await sharp(finalImage).metadata();

    console.log(
      "ASPECT EDIT RESULT",
      {
        width: finalMeta.width,
        height: finalMeta.height,
        ratio:
          finalMeta.width /
          finalMeta.height,
      }
    );

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
        "AI_MASK_OUTPAINT",

      promptVersion:
        "AI-DESIGN-PRINT-OUTPAINT-V1",
    });

  } catch (error) {
    console.error(
      "EDIT ERROR:",
      error
    );

    return json(res, 500, {
      error:
        error?.message ||
        "Không thể mở rộng ảnh AI.",
    });
  }
}
