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
   KÍCH THƯỚC ĐÍCH
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
   CHUẨN BỊ ẢNH + MASK
========================================= */

async function prepareImages(
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

  const sourceRatio =
    sourceMeta.width /
    sourceMeta.height;

  const targetRatio =
    target.width /
    target.height;

  /*
   * Thu nhỏ ảnh nguồn nhưng KHÔNG kéo méo.
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

  const left = Math.max(
    0,
    Math.floor(
      (target.width - sourceWidth) / 2
    )
  );

  const top = Math.max(
    0,
    Math.floor(
      (target.height - sourceHeight) / 2
    )
  );

  /*
   * CANVAS
   *
   * Ảnh gốc nằm giữa.
   * Phần còn thiếu là vùng cần AI mở rộng.
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

  /*
   * MASK
   *
   * Vùng ảnh gốc = đen
   * Vùng cần mở rộng = trắng
   */
  const blackArea =
    await sharp({
      create: {
        width: sourceWidth,
        height: sourceHeight,
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
      .toBuffer();

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
          input: blackArea,
          left,
          top,
        },
      ])
      .png()
      .toBuffer();

  return {
    canvas,
    mask,
    sourceRatio,
    targetRatio,
    sourceWidth,
    sourceHeight,
  };
}

/* =========================================
   PROMPT OUTPAINT
========================================= */

function buildPrompt({
  content,
  designType,
  width,
  height,
  unit,
  style,
}) {
  return `
Edit and naturally extend this professional advertising artwork.

FINAL SIZE:
${width} × ${height} ${unit}

DESIGN TYPE:
${designType}

STYLE:
${style || "Hiện đại"}

CUSTOMER CONTENT:
${content || "Professional advertising design"}

This is an OUTPAINTING task.

Preserve the existing artwork and extend only the
missing background areas.

DO NOT stretch the original artwork.

DO NOT distort:
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
- objects

DO NOT create:
- triptych
- three panels
- three separate posters
- split screen
- mirrored copies

The new background must connect naturally with the
existing artwork.

Continue the same:
- lighting
- colors
- perspective
- atmosphere
- environment
- decorative elements
- visual style

Keep the original main content intact.

The result must look like ONE SINGLE LARGE
PROFESSIONAL ADVERTISING DESIGN.

The extended background should feel continuous
from one side to the other.

Suitable for large-format printing.
`;
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
      "AI DESIGN PRINT OUTPAINT REQUEST:",
      {
        width: w,
        height: h,
        unit,
        ratio,
        target,
        designType,
        style,
      }
    );

    const sourceBuffer =
      dataUrlToBuffer(image);

    const prepared =
      await prepareImages(
        sourceBuffer,
        target
      );

    console.log(
      "AI DESIGN PRINT PREPARED:",
      {
        sourceRatio:
          prepared.sourceRatio,

        targetRatio:
          prepared.targetRatio,

        targetWidth:
          target.width,

        targetHeight:
          target.height,

        sourceWidth:
          prepared.sourceWidth,

        sourceHeight:
          prepared.sourceHeight,
      }
    );

    /*
     * QUAN TRỌNG:
     *
     * OpenAI SDK cần File/Uploadable.
     *
     * Không truyền Buffer trực tiếp.
     */
    const imageFile =
      await toFile(
        prepared.canvas,
        "canvas.png",
        {
          type: "image/png",
        }
      );

    const maskFile =
      await toFile(
        prepared.mask,
        "mask.png",
        {
          type: "image/png",
        }
      );

    const prompt =
      buildPrompt({
        content,
        designType,
        width: w,
        height: h,
        unit,
        style,
      });

    console.log(
      "AI DESIGN PRINT: sending image + mask to OpenAI"
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
        "OpenAI không trả về ảnh sau khi edit."
      );
    }

    const resultBuffer =
      Buffer.from(
        resultBase64,
        "base64"
      );

    /*
     * Đảm bảo ảnh cuối đúng tỷ lệ.
     *
     * KHÔNG dùng fit: fill.
     */
    const finalBuffer =
      await sharp(resultBuffer)
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
      "AI DESIGN PRINT OUTPAINT SUCCESS:",
      {
        width: target.width,
        height: target.height,
        ratio:
          target.width /
          target.height,
      }
    );

    return res.status(200).json({
      image: finalImage,

      width: target.width,
      height: target.height,

      targetWidth: target.width,
      targetHeight: target.height,

      ratio,

      method:
        "AI_MASK_OUTPAINT_TOFILE",

      promptVersion:
        "AI-DESIGN-PRINT-OUTPAINT-V4",

      success: true,
    });
  } catch (error) {
    console.error(
      "AI DESIGN PRINT OUTPAINT ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Không thể mở rộng thiết kế AI.",
    });
  }
}
