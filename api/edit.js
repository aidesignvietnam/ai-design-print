import OpenAI, { toFile } from "openai";
import sharp from "sharp";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =========================================
   TÍNH TỶ LỆ
========================================= */

function getRatio(width, height) {
  const w = Number(width);
  const h = Number(height);

  if (
    !Number.isFinite(w) ||
    !Number.isFinite(h) ||
    w <= 0 ||
    h <= 0
  ) {
    throw new Error("Kích thước không hợp lệ.");
  }

  return w / h;
}

/* =========================================
   KÍCH THƯỚC CANVAS ĐÍCH
========================================= */

function getTargetSize(width, height) {
  const ratio = getRatio(width, height);

  const maxWidth = 1536;
  const maxHeight = 1536;

  let targetWidth;
  let targetHeight;

  if (ratio >= 1) {
    targetWidth = maxWidth;
    targetHeight = Math.round(
      targetWidth / ratio
    );
  } else {
    targetHeight = maxHeight;
    targetWidth = Math.round(
      targetHeight * ratio
    );
  }

  targetWidth = Math.max(
    256,
    Math.round(targetWidth / 16) * 16
  );

  targetHeight = Math.max(
    256,
    Math.round(targetHeight / 16) * 16
  );

  return {
    width: targetWidth,
    height: targetHeight,
  };
}

/* =========================================
   DATA URL → BUFFER
========================================= */

function dataUrlToBuffer(dataUrl) {
  if (
    typeof dataUrl !== "string" ||
    !dataUrl.includes(",")
  ) {
    throw new Error(
      "Ảnh đầu vào không hợp lệ."
    );
  }

  const base64 = dataUrl.split(",")[1];

  return Buffer.from(base64, "base64");
}

/* =========================================
   CHUẨN BỊ CANVAS BAN ĐẦU
========================================= */

async function prepareCanvas(
  sourceBuffer,
  target
) {
  const sourceMeta =
    await sharp(sourceBuffer).metadata();

  if (
    !sourceMeta.width ||
    !sourceMeta.height
  ) {
    throw new Error(
      "Không đọc được kích thước ảnh nguồn."
    );
  }

  /*
   * Thu nhỏ ảnh nguồn theo tỷ lệ.
   * TUYỆT ĐỐI KHÔNG KÉO MÉO.
   */
  const resized =
    await sharp(sourceBuffer)
      .resize({
        width: target.width,
        height: target.height,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();

  const resizedMeta =
    await sharp(resized).metadata();

  const sourceWidth =
    resizedMeta.width;

  const sourceHeight =
    resizedMeta.height;

  if (
    !sourceWidth ||
    !sourceHeight
  ) {
    throw new Error(
      "Không xác định được kích thước ảnh sau resize."
    );
  }

  const left = Math.floor(
    (target.width - sourceWidth) / 2
  );

  const top = Math.floor(
    (target.height - sourceHeight) / 2
  );

  /*
   * Canvas trắng.
   * Ảnh gốc nằm chính giữa.
   */
  const canvas =
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
          input: resized,
          left,
          top,
        },
      ])
      .png()
      .toBuffer();

  return {
    canvas,
    sourceWidth,
    sourceHeight,
    left,
    top,
  };
}

/* =========================================
   TẠO MASK CHO MỘT VÙNG
========================================= */

async function createMask(
  target,
  editLeft,
  editRight
) {
  /*
   * Đen = giữ nguyên
   * Trắng = cho AI tạo lại / mở rộng
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
          alpha: 1,
        },
      },
    })
      .composite([
        ...(editLeft
          ? [
              {
                input: await sharp({
                  create: {
                    width: editLeft,
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
                  .png()
                  .toBuffer(),
                left: 0,
                top: 0,
              },
            ]
          : []),

        ...(editRight
          ? [
              {
                input: await sharp({
                  create: {
                    width: editRight,
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
                  .png()
                  .toBuffer(),
                left:
                  target.width -
                  editRight,
                top: 0,
              },
            ]
          : []),
      ])
      .png()
      .toBuffer();

  return mask;
}

/* =========================================
   PROMPT — MỞ RỘNG BÊN TRÁI
========================================= */

function buildLeftPrompt({
  content,
  designType,
  width,
  height,
  unit,
  style,
}) {
  return `
You are editing a professional large-format advertising design.

FINAL PRINT SIZE:
${width} × ${height} ${unit}

DESIGN TYPE:
${designType}

STYLE:
${style || "Hiện đại"}

CUSTOMER CONTENT:
${content || "Professional advertising design"}

TASK:
EXTEND THE EXISTING DESIGN TO THE LEFT.

Only the LEFT missing area is being created.

IMPORTANT:

Continue the existing artwork naturally toward the LEFT.

The new area must look like it was originally designed as part
of the same advertising artwork.

Continue:
- background
- environment
- lighting
- colors
- textures
- decorative graphics
- perspective
- atmosphere
- visual style

DO NOT move the existing artwork.

DO NOT stretch the existing artwork.

DO NOT resize or distort:
- people
- faces
- products
- logos
- text
- typography
- important objects

DO NOT duplicate:
- people
- products
- logos
- text
- major objects

DO NOT create:
- a new poster
- a separate panel
- a triptych
- a split screen
- a mirrored design
- an empty white area

The LEFT side must contain meaningful supporting visual content.

Use suitable:
- decorative elements
- environmental details
- shapes
- light
- texture
- secondary imagery
- atmospheric details

The left side must visually connect into the existing center.

The result must look like ONE continuous professional
large-format advertising design.

Do not add random text.

Do not invent a second main subject.

Preserve the original main advertising message.
`;
}

/* =========================================
   PROMPT — MỞ RỘNG BÊN PHẢI
========================================= */

function buildRightPrompt({
  content,
  designType,
  width,
  height,
  unit,
  style,
}) {
  return `
You are editing a professional large-format advertising design.

FINAL PRINT SIZE:
${width} × ${height} ${unit}

DESIGN TYPE:
${designType}

STYLE:
${style || "Hiện đại"}

CUSTOMER CONTENT:
${content || "Professional advertising design"}

TASK:
EXTEND THE EXISTING DESIGN TO THE RIGHT.

Only the RIGHT missing area is being created.

Continue the existing artwork naturally toward the RIGHT.

The new area must look like it was originally designed as part
of the same advertising artwork.

Continue:
- background
- environment
- lighting
- colors
- textures
- decorative graphics
- perspective
- atmosphere
- visual style

DO NOT move the existing artwork.

DO NOT stretch the existing artwork.

DO NOT resize or distort:
- people
- faces
- products
- logos
- text
- typography
- important objects

DO NOT duplicate:
- people
- products
- logos
- text
- major objects

DO NOT create:
- a new poster
- a separate panel
- a triptych
- a split screen
- a mirrored design
- an empty white area

The RIGHT side must contain meaningful supporting visual content.

Use suitable:
- decorative elements
- environmental details
- shapes
- light
- texture
- secondary imagery
- atmospheric details

The right side must visually connect into the existing center.

The result must look like ONE continuous professional
large-format advertising design.

Do not add random text.

Do not invent a second main subject.

Preserve the original main advertising message.
`;
}

/* =========================================
   GỌI OPENAI EDIT
========================================= */

async function runOutpaint({
  canvas,
  mask,
  prompt,
}) {
  const imageFile =
    await toFile(
      canvas,
      "canvas.png",
      {
        type: "image/png",
      }
    );

  const maskFile =
    await toFile(
      mask,
      "mask.png",
      {
        type: "image/png",
      }
    );

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

  const resultBase64 =
    response?.data?.[0]?.b64_json;

  if (!resultBase64) {
    throw new Error(
      "OpenAI không trả về ảnh sau khi outpaint."
    );
  }

  return Buffer.from(
    resultBase64,
    "base64"
  );
}

/* =========================================
   API
========================================= */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed.",
    });
  }

  try {
    const {
      image,
      content = "",
      designType = "Backdrop",
      width,
      height,
      unit = "cm",
      style = "Hiện đại",
    } = req.body || {};

    const w = Number(width);
    const h = Number(height);

    if (
      !image ||
      !Number.isFinite(w) ||
      !Number.isFinite(h) ||
      w <= 0 ||
      h <= 0
    ) {
      return res.status(400).json({
        error:
          "Thiếu ảnh hoặc kích thước không hợp lệ.",
      });
    }

    const ratio = getRatio(w, h);

    const target =
      getTargetSize(w, h);

    console.log(
      "========================================"
    );

    console.log(
      "AI DESIGN PRINT PANORAMA OUTPAINT V2"
    );

    console.log({
      width: w,
      height: h,
      unit,
      ratio,
      target,
      designType,
      style,
    });

    console.log(
      "========================================"
    );

    const sourceBuffer =
      dataUrlToBuffer(image);

    const prepared =
      await prepareCanvas(
        sourceBuffer,
        target
      );

    const {
      canvas,
      sourceWidth,
      sourceHeight,
      left,
    } = prepared;

    /*
     * ======================================
     * TÍNH VÙNG CẦN MỞ RỘNG
     * ======================================
     */

    const right =
      target.width -
      left -
      sourceWidth;

    console.log(
      "PANORAMA SOURCE:",
      {
        sourceWidth,
        sourceHeight,
        left,
        right,
      }
    );

    /*
     * Nếu không phải panorama cực rộng,
     * dùng một lần outpaint bình thường.
     */

    if (
      right <= 32 &&
      left <= 32
    ) {
      const mask =
        await createMask(
          target,
          0,
          0
        );

      const prompt =
        buildLeftPrompt({
          content,
          designType,
          width: w,
          height: h,
          unit,
          style,
        });

      const result =
        await runOutpaint({
          canvas,
          mask,
          prompt,
        });

      const finalBuffer =
        await sharp(result)
          .resize({
            width: target.width,
            height: target.height,
            fit: "contain",
            background: {
              r: 255,
              g: 255,
              b: 255,
              alpha: 1,
            },
          })
          .png({
            compressionLevel: 9,
          })
          .toBuffer();

      return res.status(200).json({
        image:
          `data:image/png;base64,${finalBuffer.toString(
            "base64"
          )}`,

        width: target.width,
        height: target.height,

        targetWidth: target.width,
        targetHeight: target.height,

        ratio,

        method:
          "AI_MASK_OUTPAINT_SINGLE",

        promptVersion:
          "AI-DESIGN-PRINT-OUTPAINT-V5",

        success: true,
      });
    }

    /*
     * ======================================
     * PANORAMA EXTREME
     *
     * LƯỢT 1:
     * CHỈ MỞ RỘNG BÊN TRÁI
     * ======================================
     */

    console.log(
      "PANORAMA PASS 1: LEFT"
    );

    const leftMaskWidth =
      Math.max(
        32,
        Math.min(
          target.width,
          left
        )
      );

    const leftMask =
      await createMask(
        target,
        leftMaskWidth,
        0
      );

    const leftPrompt =
      buildLeftPrompt({
        content,
        designType,
        width: w,
        height: h,
        unit,
        style,
      });

    const leftResult =
      await runOutpaint({
        canvas,
        mask: leftMask,
        prompt: leftPrompt,
      });

    /*
     * ======================================
     * LƯỢT 2:
     * MỞ RỘNG BÊN PHẢI
     * ======================================
     */

    console.log(
      "PANORAMA PASS 2: RIGHT"
    );

    const rightMaskWidth =
      Math.max(
        32,
        Math.min(
          target.width,
          right
        )
      );

    const rightMask =
      await createMask(
        target,
        0,
        rightMaskWidth
      );

    const rightPrompt =
      buildRightPrompt({
        content,
        designType,
        width: w,
        height: h,
        unit,
        style,
      });

    const finalResult =
      await runOutpaint({
        canvas: leftResult,
        mask: rightMask,
        prompt: rightPrompt,
      });

    /*
     * ======================================
     * CHUẨN HÓA ẢNH CUỐI
     * ======================================
     */

    const finalBuffer =
      await sharp(finalResult)
        .resize({
          width: target.width,
          height: target.height,
          fit: "contain",
          background: {
            r: 255,
            g: 255,
            b: 255,
            alpha: 1,
          },
        })
        .png({
          compressionLevel: 9,
        })
        .toBuffer();

    const finalImage =
      `data:image/png;base64,${finalBuffer.toString(
        "base64"
      )}`;

    console.log(
      "========================================"
    );

    console.log(
      "AI DESIGN PRINT PANORAMA SUCCESS"
    );

    console.log({
      finalWidth: target.width,
      finalHeight: target.height,
      finalRatio:
        target.width /
        target.height,
      method:
        "AI_TWO_PASS_LEFT_RIGHT_OUTPAINT",
    });

    console.log(
      "========================================"
    );

    return res.status(200).json({
      image: finalImage,

      width: target.width,
      height: target.height,

      targetWidth: target.width,
      targetHeight: target.height,

      ratio,

      method:
        "AI_TWO_PASS_LEFT_RIGHT_OUTPAINT",

      promptVersion:
        "AI-DESIGN-PRINT-OUTPAINT-V5",

      success: true,
    });
  } catch (error) {
    console.error(
      "AI DESIGN PRINT PANORAMA OUTPAINT ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Không thể mở rộng thiết kế AI.",
    });
  }
}
