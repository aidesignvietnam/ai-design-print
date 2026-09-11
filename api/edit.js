import OpenAI from "openai";
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
   KÍCH THƯỚC ĐẦU RA
========================================= */

function getTargetSize(width, height) {
  const ratio = getRatio(width, height);

  const MAX_WIDTH = 1536;
  const MAX_HEIGHT = 1536;

  let targetWidth;
  let targetHeight;

  if (ratio >= 1) {
    targetWidth = MAX_WIDTH;
    targetHeight = Math.round(
      targetWidth / ratio
    );
  } else {
    targetHeight = MAX_HEIGHT;
    targetWidth = Math.round(
      targetHeight * ratio
    );
  }

  targetWidth = Math.max(
    256,
    Math.round(targetWidth / 8) * 8
  );

  targetHeight = Math.max(
    256,
    Math.round(targetHeight / 8) * 8
  );

  return {
    width: targetWidth,
    height: targetHeight,
  };
}

/* =========================================
   CHUYỂN DATA URL → BUFFER
========================================= */

function dataUrlToBuffer(dataUrl) {
  if (!dataUrl) {
    throw new Error("Không có ảnh đầu vào.");
  }

  if (typeof dataUrl !== "string") {
    throw new Error("Ảnh đầu vào không hợp lệ.");
  }

  const commaIndex = dataUrl.indexOf(",");

  if (commaIndex === -1) {
    throw new Error("Data URL không hợp lệ.");
  }

  const base64 = dataUrl.slice(
    commaIndex + 1
  );

  return Buffer.from(base64, "base64");
}

/* =========================================
   BUFFER → DATA URL
========================================= */

function bufferToDataUrl(buffer) {
  return `data:image/png;base64,${buffer.toString(
    "base64"
  )}`;
}

/* =========================================
   TẠO CANVAS TRONG SUỐT
========================================= */

async function prepareCanvas(
  imageBuffer,
  target
) {
  const image = sharp(imageBuffer);

  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error(
      "Không đọc được kích thước ảnh."
    );
  }

  const sourceRatio =
    metadata.width / metadata.height;

  const targetRatio =
    target.width / target.height;

  console.log(
    "ASPECT SOURCE:",
    {
      width: metadata.width,
      height: metadata.height,
      ratio: sourceRatio,
    }
  );

  console.log(
    "ASPECT TARGET:",
    {
      width: target.width,
      height: target.height,
      ratio: targetRatio,
    }
  );

  /*
   * Giữ nguyên tỷ lệ ảnh nguồn.
   *
   * KHÔNG dùng fit: fill.
   *
   * Ảnh được thu nhỏ vừa đủ để nằm trong
   * canvas mục tiêu.
   */

  const resized = await image
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

  const resizedWidth =
    resizedMeta.width || target.width;

  const resizedHeight =
    resizedMeta.height || target.height;

  /*
   * Đặt ảnh nguồn ở giữa canvas.
   *
   * Phần còn lại là vùng cần AI mở rộng.
   */

  const left =
    Math.max(
      0,
      Math.round(
        (target.width - resizedWidth) / 2
      )
    );

  const top =
    Math.max(
      0,
      Math.round(
        (target.height - resizedHeight) / 2
      )
    );

  const canvas = await sharp({
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
        input: resized,
        left,
        top,
      },
    ])
    .png()
    .toBuffer();

  /*
   * Mask:
   *
   * Trắng = vùng AI được phép chỉnh sửa/mở rộng.
   * Đen = vùng nội dung gốc cần bảo vệ.
   *
   * Ta để vùng ngoài ảnh gốc là trắng.
   */

  const mask = await sharp({
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
            width: resizedWidth,
            height: resizedHeight,
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

  return {
    canvas,
    mask,
    sourceRatio,
    targetRatio,
  };
}

/* =========================================
   PROMPT OUTPAINT
========================================= */

function buildEditPrompt({
  content,
  designType,
  width,
  height,
  unit,
  style,
}) {
  return `
You are editing an existing professional advertising artwork.

FINAL PHYSICAL SIZE:
${width} × ${height} ${unit}

DESIGN TYPE:
${designType}

STYLE:
${style || "Hiện đại"}

CUSTOMER CONTENT:
${content || "Professional advertising design"}

IMPORTANT:

Extend the existing artwork naturally to the required final aspect ratio.

This is OUTPAINTING, not stretching.

PRESERVE the original central artwork.

DO NOT stretch or deform:
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
- objects
- text

DO NOT create:
- triptych
- three panels
- three separate posters
- split screen
- repeated copies
- mirrored subjects

The newly created areas must look like a natural continuation
of the original background.

Continue:
- background
- lighting
- colors
- atmosphere
- architectural/environmental elements
- decorative elements

Maintain the same visual style and perspective.

The final result must look like ONE SINGLE LARGE PROFESSIONAL
ADVERTISING DESIGN.

The background must flow continuously from left to right
or from top to bottom depending on the required format.

Keep the main content visually coherent and correctly proportioned.

Do not redesign the original content unnecessarily.

Only extend the canvas where additional space is required.

The result should be suitable for large-format printing.
`;
}

/* =========================================
   API HANDLER
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

    const target = getTargetSize(
      w,
      h
    );

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

    const imageBuffer =
      dataUrlToBuffer(image);

    const prepared =
      await prepareCanvas(
        imageBuffer,
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
      }
    );

    const editPrompt =
      buildEditPrompt({
        content,
        designType,
        width: w,
        height: h,
        unit,
        style,
      });

    const response =
      await openai.images.edit({
        model: "gpt-image-2",

        image: prepared.canvas,

        mask: prepared.mask,

        prompt: editPrompt,

        size: "auto",

        quality: "high",

        output_format: "png",
      });

    const resultBase64 =
      response?.data?.[0]?.b64_json;

    if (!resultBase64) {
      throw new Error(
        "AI không trả về ảnh sau khi mở rộng."
      );
    }

    const resultBuffer =
      Buffer.from(
        resultBase64,
        "base64"
      );

    /*
     * Chỉ resize về đúng tỷ lệ nếu AI trả về
     * kích thước khác target.
     *
     * KHÔNG dùng fit: fill.
     *
     * Vì mục tiêu là bảo vệ tỷ lệ nội dung.
     */

    const processed =
      await sharp(resultBuffer)
        .resize({
          width: target.width,
          height: target.height,
          fit: "contain",
          background: {
            r: 255,
            g: 255,
            b: 255,
            alpha: 0,
          },
        })
        .png({
          compressionLevel: 9,
          adaptiveFiltering: true,
        })
        .toBuffer();

    const finalImage =
      bufferToDataUrl(processed);

    console.log(
      "AI DESIGN PRINT OUTPAINT RESULT:",
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
        "AI_MASK_OUTPAINT_NO_STRETCH",

      promptVersion:
        "AI-DESIGN-PRINT-OUTPAINT-V3",

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
