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
   KÍCH THƯỚC CANVAS
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

  /*
   * GPT Image yêu cầu kích thước phù hợp.
   * Ép cả hai cạnh về bội số 16.
   */
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

  const base64 =
    dataUrl.split(",")[1];

  return Buffer.from(
    base64,
    "base64"
  );
}

/* =========================================
   CHUẨN HÓA ẢNH
========================================= */

async function normalizeImage(
  buffer,
  target
) {
  return sharp(buffer)
    .resize({
      width: target.width,
      height: target.height,
      fit: "fill",
    })
    .ensureAlpha()
    .png()
    .toBuffer();
}

/* =========================================
   CHUẨN BỊ CANVAS
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
   * Thu nhỏ ảnh gốc KHÔNG méo.
   */
  const resized =
    await sharp(sourceBuffer)
      .resize({
        width: target.width,
        height: target.height,
        fit: "inside",
        withoutEnlargement: true,
      })
      .ensureAlpha()
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
      "Không xác định được kích thước ảnh nguồn."
    );
  }

  const left = Math.floor(
    (target.width - sourceWidth) / 2
  );

  const top = Math.floor(
    (target.height - sourceHeight) / 2
  );

  /*
   * Canvas.
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
      .ensureAlpha()
      .png()
      .toBuffer();

  /*
   * Đảm bảo canvas đúng tuyệt đối.
   */
  const normalizedCanvas =
    await normalizeImage(
      canvas,
      target
    );

  return {
    canvas: normalizedCanvas,
    sourceWidth,
    sourceHeight,
    left,
    top,
  };
}

/* =========================================
   TẠO MASK
========================================= */

async function createMask(
  target,
  side,
  amount
) {
  /*
   * Đen = giữ nguyên.
   * Trắng = vùng AI được phép tạo.
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
      .png()
      .toBuffer();

  const whiteArea =
    await sharp({
      create: {
        width: amount,
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
      .toBuffer();

  let left = 0;

  if (side === "right") {
    left =
      target.width - amount;
  }

  const result =
    await sharp(mask)
      .composite([
        {
          input: whiteArea,
          left,
          top: 0,
        },
      ])
      .ensureAlpha()
      .png()
      .toBuffer();

  /*
   * Đảm bảo mask có chính xác
   * cùng kích thước canvas.
   */
  return normalizeImage(
    result,
    target
  );
}

/* =========================================
   PROMPT BÊN TRÁI
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
You are extending a professional advertising artwork.

FINAL PRINT SIZE:
${width} × ${height} ${unit}

DESIGN TYPE:
${designType}

STYLE:
${style || "Hiện đại"}

CUSTOMER CONTENT:
${content || "Professional advertising design"}

EXTEND ONLY THE LEFT SIDE.

The existing artwork must remain intact.

Continue the existing:
- background
- environment
- lighting
- colors
- textures
- perspective
- decorative elements
- atmosphere

Create useful visual content across the new left area.

Do NOT leave the new left area empty.

Do NOT create a separate poster.

Do NOT create a panel.

Do NOT create a triptych.

Do NOT create a split screen.

Do NOT mirror the existing design.

Do NOT duplicate people.

Do NOT duplicate products.

Do NOT duplicate logos.

Do NOT duplicate text.

Do NOT distort people, products, logos or typography.

The new left area must naturally connect with the existing artwork.

It must look like one continuous professional advertising design.

Do not add random text.

Do not create a second main advertising message.
`;
}

/* =========================================
   PROMPT BÊN PHẢI
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
You are extending a professional advertising artwork.

FINAL PRINT SIZE:
${width} × ${height} ${unit}

DESIGN TYPE:
${designType}

STYLE:
${style || "Hiện đại"}

CUSTOMER CONTENT:
${content || "Professional advertising design"}

EXTEND ONLY THE RIGHT SIDE.

The existing artwork must remain intact.

Continue the existing:
- background
- environment
- lighting
- colors
- textures
- perspective
- decorative elements
- atmosphere

Create useful visual content across the new right area.

Do NOT leave the new right area empty.

Do NOT create a separate poster.

Do NOT create a panel.

Do NOT create a triptych.

Do NOT create a split screen.

Do NOT mirror the existing design.

Do NOT duplicate people.

Do NOT duplicate products.

Do NOT duplicate logos.

Do NOT duplicate text.

Do NOT distort people, products, logos or typography.

The new right area must naturally connect with the existing artwork.

It must look like one continuous professional advertising design.

Do not add random text.

Do not create a second main advertising message.
`;
}

/* =========================================
   OPENAI OUTPAINT
========================================= */

async function runOutpaint({
  canvas,
  mask,
  prompt,
  target,
}) {
  /*
   * QUAN TRỌNG:
   * Ép IMAGE và MASK về cùng kích thước
   * ngay trước khi gửi OpenAI.
   */

  const normalizedCanvas =
    await normalizeImage(
      canvas,
      target
    );

  const normalizedMask =
    await normalizeImage(
      mask,
      target
    );

  const imageMeta =
    await sharp(
      normalizedCanvas
    ).metadata();

  const maskMeta =
    await sharp(
      normalizedMask
    ).metadata();

  console.log(
    "OPENAI EDIT DIMENSIONS:",
    {
      imageWidth: imageMeta.width,
      imageHeight: imageMeta.height,
      maskWidth: maskMeta.width,
      maskHeight: maskMeta.height,
    }
  );

  if (
    imageMeta.width !==
      maskMeta.width ||
    imageMeta.height !==
      maskMeta.height
  ) {
    throw new Error(
      "IMAGE và MASK không cùng kích thước."
    );
  }

  const imageFile =
    await toFile(
      normalizedCanvas,
      "canvas.png",
      {
        type: "image/png",
      }
    );

  const maskFile =
    await toFile(
      normalizedMask,
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
      "OpenAI không trả về ảnh."
    );
  }

  const resultBuffer =
    Buffer.from(
      resultBase64,
      "base64"
    );

  /*
   * RẤT QUAN TRỌNG:
   * Chuẩn hóa kết quả trước khi
   * đưa sang lượt outpaint tiếp theo.
   */
  return normalizeImage(
    resultBuffer,
    target
  );
}

/* =========================================
   API
========================================= */

export default async function handler(
  req,
  res
) {
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

    const ratio =
      getRatio(w, h);

    const target =
      getTargetSize(w, h);

    console.log(
      "========================================"
    );

    console.log(
      "AI DESIGN PRINT PANORAMA OUTPAINT V3"
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
      left,
    } = prepared;

    const right =
      target.width -
      left -
      sourceWidth;

    console.log(
      "SOURCE / TARGET:",
      {
        sourceWidth,
        left,
        right,
        targetWidth:
          target.width,
        targetHeight:
          target.height,
      }
    );

    /*
     * ======================================
     * KHÔNG CẦN OUTPAINT
     * ======================================
     */

    if (
      left <= 32 &&
      right <= 32
    ) {
      const finalBuffer =
        await normalizeImage(
          canvas,
          target
        );

      return res.status(200).json({
        image:
          `data:image/png;base64,${finalBuffer.toString(
            "base64"
          )}`,

        width: target.width,
        height: target.height,

        targetWidth:
          target.width,

        targetHeight:
          target.height,

        ratio,

        method:
          "AI_NO_OUTPAINT",

        promptVersion:
          "AI-DESIGN-PRINT-OUTPAINT-V6",

        success: true,
      });
    }

    /*
     * ======================================
     * LƯỢT 1
     * MỞ RỘNG BÊN TRÁI
     * ======================================
     */

    console.log(
      "PANORAMA PASS 1: LEFT"
    );

    const leftAmount =
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
        "left",
        leftAmount
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
        target,
      });

    console.log(
      "PASS 1 COMPLETE"
    );

    /*
     * ======================================
     * LƯỢT 2
     * MỞ RỘNG BÊN PHẢI
     * ======================================
     */

    console.log(
      "PANORAMA PASS 2: RIGHT"
    );

    /*
     * leftResult ĐÃ được normalize
     * về đúng target ở trên.
     */

    const rightAmount =
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
        "right",
        rightAmount
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
        target,
      });

    console.log(
      "PASS 2 COMPLETE"
    );

    /*
     * ======================================
     * ẢNH CUỐI
     * ======================================
     */

    const finalBuffer =
      await normalizeImage(
        finalResult,
        target
      );

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
      finalWidth:
        target.width,

      finalHeight:
        target.height,

      finalRatio:
        target.width /
        target.height,

      method:
        "AI_TWO_PASS_LEFT_RIGHT_OUTPAINT_V3",
    });

    console.log(
      "========================================"
    );

    return res.status(200).json({
      image: finalImage,

      width:
        target.width,

      height:
        target.height,

      targetWidth:
        target.width,

      targetHeight:
        target.height,

      ratio,

      method:
        "AI_TWO_PASS_LEFT_RIGHT_OUTPAINT_V3",

      promptVersion:
        "AI-DESIGN-PRINT-OUTPAINT-V6",

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
