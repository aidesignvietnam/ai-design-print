```javascript
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

/*
 * GPT-Image-2 hỗ trợ kích thước linh hoạt.
 *
 * Chọn canvas tối đa 3840px và làm tròn chiều còn lại
 * theo bội số 16 để giữ đúng tỷ lệ tốt nhất.
 */
function getTargetSize(width, height) {
  const ratio = getRatio(width, height);

  const maxDimension = 3840;

  let targetWidth;
  let targetHeight;

  if (ratio >= 1) {
    targetWidth = maxDimension;
    targetHeight =
      Math.round((targetWidth / ratio) / 16) * 16;
  } else {
    targetHeight = maxDimension;
    targetWidth =
      Math.round((targetHeight * ratio) / 16) * 16;
  }

  targetWidth = Math.max(256, targetWidth);
  targetHeight = Math.max(256, targetHeight);

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
${ratio.toFixed(4)} : 1

DESIGN TYPE:
${designType || "Banner"}

STYLE:
${style || "Hiện đại"}

DESIGN BRIEF:
${content || "Professional advertising design."}

TASK:

Expand the existing artwork into the transparent/masked areas.

IMPORTANT:

Preserve the existing artwork exactly.

Do NOT resize or distort the existing people,
products, objects, logos, or typography.

Do NOT make people shorter or taller.

Do NOT stretch faces or bodies.

Do NOT stretch products.

Do NOT change the proportions of important objects.

Do NOT redesign the existing composition.

Do NOT create a second version of the design.

Do NOT duplicate the main subject.

Do NOT duplicate people.

Do NOT duplicate products.

Do NOT duplicate logos.

Do NOT duplicate typography.

Do NOT create three panels.

Do NOT create a triptych.

Do NOT mirror the artwork.

Do NOT create a central frame.

Do NOT create a border.

Do NOT create a mockup.

Do NOT create a wall or billboard presentation.

The masked areas must become a natural continuation
of the existing background and environment.

Continue naturally:
- background
- lighting
- gradients
- scenery
- architecture
- textures
- decorative elements
- atmosphere
- colors
- depth

The original important advertising content must remain
in its original proportions.

The main subject must appear only once.

The final artwork must look like ONE continuous
professional large-format advertising design.

The final composition must fill the entire target canvas.

No empty white areas.

No black bars.

No unrelated text.

No watermarks.

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
     * =================================================
     * 1. Đưa ảnh gốc vào canvas mới.
     *
     * QUAN TRỌNG:
     * Không dùng "fill".
     * Không kéo méo ảnh.
     *
     * Ảnh gốc được giữ nguyên tỷ lệ.
     * =================================================
     */

    const fitted =
      await sharp(originalBuffer)
        .resize({
          width: target.width,
          height: target.height,
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

    const left =
      Math.round(
        (target.width - fittedWidth) / 2
      );

    const top =
      Math.round(
        (target.height - fittedHeight) / 2
      );

    /*
     * =================================================
     * 2. Tạo canvas trong suốt.
     *
     * Phần ảnh gốc nằm giữa.
     * Phần ngoài là vùng AI phải mở rộng.
     * =================================================
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
            left,
            top,
          },
        ])
        .png()
        .toBuffer();

    /*
     * =================================================
     * 3. Tạo MASK ĐÚNG cho OpenAI.
     *
     * OpenAI:
     *
     * TRANSPARENT = AI được phép chỉnh / mở rộng
     * OPAQUE      = giữ nguyên artwork gốc
     *
     * Vì vậy:
     *
     * - Toàn bộ canvas = transparent
     * - Vị trí artwork gốc = opaque
     * =================================================
     */

    const mask =
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
            input:
              await sharp({
                create: {
                  width: fittedWidth,
                  height: fittedHeight,
                  channels: 4,

                  background: {
                    r: 255,
                    g: 255,
                    b: 255,
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
     * =================================================
     * 4. Gửi canvas + mask cho GPT-Image-2.
     * =================================================
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

        /*
         * Yêu cầu AI trả về đúng canvas mục tiêu.
         * Không dùng auto vì auto có thể trả về tỷ lệ khác.
         */
        size:
          `${target.width}x${target.height}`,

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
     * =================================================
     * 5. Kiểm tra kích thước AI trả về.
     *
     * TUYỆT ĐỐI KHÔNG dùng fit:"fill".
     *
     * Nếu AI đã trả đúng canvas -> dùng nguyên ảnh.
     *
     * Nếu khác kích thước nhưng cùng tỷ lệ ->
     * resize theo tỷ lệ, không bóp méo.
     *
     * Nếu khác tỷ lệ quá nhiều ->
     * báo lỗi thay vì tạo ảnh bị lùn.
     * =================================================
     */

    const resultMeta =
      await sharp(resultBuffer).metadata();

    const resultWidth =
      resultMeta.width || 0;

    const resultHeight =
      resultMeta.height || 0;

    if (!resultWidth || !resultHeight) {
      throw new Error(
        "Không đọc được kích thước ảnh AI trả về."
      );
    }

    const resultRatio =
      resultWidth / resultHeight;

    const ratioDifference =
      Math.abs(
        resultRatio - targetRatio
      ) / targetRatio;

    console.log(
      "AI RESULT SIZE",
      {
        resultWidth,
        resultHeight,
        resultRatio,
        targetWidth: target.width,
        targetHeight: target.height,
        targetRatio,
        ratioDifference,
      }
    );

    let finalImage;

    /*
     * Trường hợp đúng kích thước.
     */
    if (
      resultWidth === target.width &&
      resultHeight === target.height
    ) {
      finalImage = await sharp(
        resultBuffer
      )
        .png()
        .toBuffer();
    }

    /*
     * Trường hợp khác pixel nhưng tỷ lệ vẫn gần đúng.
     *
     * Resize theo tỷ lệ, KHÔNG stretch.
     */
    else if (ratioDifference <= 0.02) {
      finalImage =
        await sharp(resultBuffer)
          .resize({
            width: target.width,
            height: target.height,
            fit: "inside",
            withoutEnlargement: false,
          })
          .png()
          .toBuffer();

      /*
       * Sau resize có thể nhỏ hơn canvas một chút.
       * Đặt lên canvas đúng kích thước mà không kéo méo.
       */
      const finalMeta =
        await sharp(finalImage).metadata();

      const finalWidth =
        finalMeta.width || target.width;

      const finalHeight =
        finalMeta.height || target.height;

      if (
        finalWidth !== target.width ||
        finalHeight !== target.height
      ) {
        finalImage =
          await sharp({
            create: {
              width: target.width,
              height: target.height,
              channels: 4,
              background: {
                r: 255,
                g: 255,
                b: 255,
                alpha: 0,
              },
            },
          })
            .composite([
              {
                input: finalImage,
                left: Math.round(
                  (target.width - finalWidth) / 2
                ),
                top: Math.round(
                  (target.height - finalHeight) / 2
                ),
              },
            ])
            .png()
            .toBuffer();
      }
    }

    /*
     * AI trả về tỷ lệ sai quá nhiều.
     *
     * Không ép ảnh.
     * Báo lỗi để tránh xuất ra hình bị lùn.
     */
    else {
      throw new Error(
        `AI trả về tỷ lệ ${resultRatio.toFixed(
          3
        )}, khác tỷ lệ yêu cầu ${targetRatio.toFixed(
          3
        )}. Hệ thống không ép méo ảnh.`
      );
    }

    const finalMeta =
      await sharp(finalImage).metadata();

    console.log(
      "ASPECT EDIT FINAL",
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
        "AI_MASK_OUTPAINT_NO_STRETCH",

      promptVersion:
        "AI-DESIGN-PRINT-OUTPAINT-V2",
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
```
