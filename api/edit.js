import OpenAI from "openai";
import { toFile } from "openai/uploads";
import sharp from "sharp";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function getLayoutType(width, height) {
  const ratio = width / height;

  if (ratio >= 4) return "ULTRA_WIDE";
  if (ratio >= 2) return "WIDE";
  if (ratio <= 0.5) return "ULTRA_TALL";
  if (ratio <= 0.87) return "PORTRAIT";
  if (ratio >= 1.15) return "LANDSCAPE";

  return "SQUARE";
}

function dataUrlToBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") {
    throw new Error("Không có dữ liệu ảnh.");
  }

  const match = dataUrl.match(
    /^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/
  );

  if (!match) {
    throw new Error("Định dạng ảnh đầu vào không hợp lệ.");
  }

  return Buffer.from(match[2], "base64");
}

function bufferToDataUrl(buffer, mime = "image/png") {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function getImageInfo(buffer) {
  const meta = await sharp(buffer).metadata();

  if (!meta.width || !meta.height) {
    throw new Error("Không đọc được kích thước ảnh.");
  }

  return {
    width: meta.width,
    height: meta.height,
    ratio: meta.width / meta.height,
  };
}

async function createExpansionCanvas(
  sourceBuffer,
  targetWidth,
  targetHeight
) {
  const sourceInfo = await getImageInfo(sourceBuffer);

  const targetRatio = targetWidth / targetHeight;

  const canvasWidth = 1536;
  const canvasHeight = Math.max(
    256,
    Math.round(canvasWidth / targetRatio)
  );

  let resizedWidth;
  let resizedHeight;

  if (sourceInfo.ratio > targetRatio) {
    resizedWidth = canvasWidth;
    resizedHeight = Math.round(
      canvasWidth / sourceInfo.ratio
    );
  } else {
    resizedHeight = canvasHeight;
    resizedWidth = Math.round(
      canvasHeight * sourceInfo.ratio
    );
  }

  const resized = await sharp(sourceBuffer)
    .resize(resizedWidth, resizedHeight, {
      fit: "fill",
    })
    .png()
    .toBuffer();

  const left = Math.max(
    0,
    Math.round((canvasWidth - resizedWidth) / 2)
  );

  const top = Math.max(
    0,
    Math.round((canvasHeight - resizedHeight) / 2)
  );

  const canvas = await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
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

  return {
    buffer: canvas,
    width: canvasWidth,
    height: canvasHeight,
    sourceWidth: sourceInfo.width,
    sourceHeight: sourceInfo.height,
    sourceRatio: sourceInfo.ratio,
    targetRatio,
  };
}

async function createFinalRatioImage(
  aiBuffer,
  targetWidth,
  targetHeight
) {
  const aiInfo = await getImageInfo(aiBuffer);

  const targetRatio = targetWidth / targetHeight;

  /*
   * Final PNG canvas.
   *
   * 400 × 70 cm
   * => 2400 × 420 px
   */
  const finalWidth = 2400;

  const finalHeight = Math.max(
    1,
    Math.round(finalWidth / targetRatio)
  );

  /*
   * Giữ nguyên tỷ lệ AI.
   * Không kéo méo nội dung.
   */
  let centerWidth;
  let centerHeight;

  if (aiInfo.ratio > targetRatio) {
    centerWidth = finalWidth;
    centerHeight = Math.round(
      finalWidth / aiInfo.ratio
    );
  } else {
    centerHeight = finalHeight;
    centerWidth = Math.round(
      finalHeight * aiInfo.ratio
    );
  }

  const center = await sharp(aiBuffer)
    .resize(centerWidth, centerHeight, {
      fit: "fill",
    })
    .png()
    .toBuffer();

  /*
   * Tạo nền mở rộng từ mép ảnh.
   *
   * Đây chỉ là lớp nền tạm thời.
   * AI đã được yêu cầu mở rộng thiết kế trước đó.
   */
  const background = await sharp({
    create: {
      width: finalWidth,
      height: finalHeight,
      channels: 4,
      background: {
        r: 255,
        g: 255,
        b: 255,
        alpha: 1,
      },
    },
  }).png().toBuffer();

  const left =
    Math.max(0, Math.round((finalWidth - centerWidth) / 2));

  const top =
    Math.max(0, Math.round((finalHeight - centerHeight) / 2));

  const finalBuffer = await sharp(background)
    .composite([
      {
        input: center,
        left,
        top,
      },
    ])
    .png()
    .toBuffer();

  const finalInfo = await getImageInfo(finalBuffer);

  return {
    buffer: finalBuffer,
    width: finalInfo.width,
    height: finalInfo.height,
    ratio: finalInfo.ratio,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const {
      image,
      editPrompt = "",
      targetWidth,
      targetHeight,
      width,
      height,
      designType = "Backdrop",
      style = "Hiện đại",
    } = req.body || {};

    const finalTargetWidth = Number(
      targetWidth || width
    );

    const finalTargetHeight = Number(
      targetHeight || height
    );

    if (
      !Number.isFinite(finalTargetWidth) ||
      !Number.isFinite(finalTargetHeight) ||
      finalTargetWidth <= 0 ||
      finalTargetHeight <= 0
    ) {
      return res.status(400).json({
        error: "Kích thước thiết kế không hợp lệ.",
      });
    }

    if (!image) {
      return res.status(400).json({
        error: "Không có ảnh để chỉnh sửa.",
      });
    }

    const sourceBuffer = dataUrlToBuffer(image);

    const sourceInfo =
      await getImageInfo(sourceBuffer);

    const targetRatio =
      finalTargetWidth / finalTargetHeight;

    const layoutType = getLayoutType(
      finalTargetWidth,
      finalTargetHeight
    );

    const aspectPrompt = `
You are finishing a professional advertising print design.

TARGET DOCUMENT:
${finalTargetWidth} × ${finalTargetHeight} cm

TARGET ASPECT RATIO:
${targetRatio.toFixed(4)} : 1

DESIGN TYPE:
${designType}

STYLE:
${style}

TASK:

Expand the existing artwork naturally to the requested ultra-wide
or print aspect ratio.

IMPORTANT RULES:

- NEVER stretch or squash the original artwork.
- NEVER distort people.
- NEVER distort faces.
- NEVER distort bodies.
- NEVER distort products.
- NEVER distort vehicles.
- NEVER distort logos.
- NEVER distort typography.
- Preserve the original visual identity.
- Keep important content in the central safe area.
- Naturally continue the background into the additional space.
- Continue lighting, gradients, scenery, textures and decorative elements.
- Make the result look like one continuous professional design.
- Do not duplicate the central image.
- Do not mirror the image.
- Do not create repeating patterns.
- Do not create blurred side panels.
- Do not create white empty strips.
- Do not add random text.
- Do not add watermarks.

The final artwork must look intentionally designed for the requested
large-format advertising document.

${editPrompt}
`;

    /*
     * Chuẩn bị canvas theo đúng tỷ lệ mục tiêu.
     */
    const expansionCanvas =
      await createExpansionCanvas(
        sourceBuffer,
        finalTargetWidth,
        finalTargetHeight
      );

    /*
     * QUAN TRỌNG:
     *
     * OpenAI Images Edit yêu cầu FILE,
     * không nhận Data URL string ở trường image.
     */
    const imageFile = await toFile(
      expansionCanvas.buffer,
      "ai-design-print.png",
      {
        type: "image/png",
      }
    );

    console.log("EDIT REQUEST", {
      designType,
      targetWidth: finalTargetWidth,
      targetHeight: finalTargetHeight,
      targetRatio,
      layoutType,
      sourceWidth: sourceInfo.width,
      sourceHeight: sourceInfo.height,
      workingWidth: expansionCanvas.width,
      workingHeight: expansionCanvas.height,
    });

    const response = await openai.images.edit({
      model: "gpt-image-2.5-sunburst",
      image: imageFile,
      prompt: aspectPrompt,
      size: "auto",
      quality: "high",
    });

    const resultBase64 =
      response?.data?.[0]?.b64_json;

    if (!resultBase64) {
      throw new Error(
        "AI không trả về ảnh sau khi mở rộng."
      );
    }

    const aiBuffer =
      Buffer.from(resultBase64, "base64");

    const aiInfo =
      await getImageInfo(aiBuffer);

    /*
     * Tạo PNG cuối cùng theo đúng tỷ lệ tài liệu.
     */
    const finalResult =
      await createFinalRatioImage(
        aiBuffer,
        finalTargetWidth,
        finalTargetHeight
      );

    const finalImage =
      bufferToDataUrl(finalResult.buffer);

    return res.status(200).json({
      image: finalImage,

      targetWidth: finalTargetWidth,
      targetHeight: finalTargetHeight,
      targetRatio,

      layoutType,

      source: {
        width: sourceInfo.width,
        height: sourceInfo.height,
        ratio: sourceInfo.ratio,
      },

      workingCanvas: {
        width: expansionCanvas.width,
        height: expansionCanvas.height,
        ratio:
          expansionCanvas.width /
          expansionCanvas.height,
      },

      aiOutput: {
        width: aiInfo.width,
        height: aiInfo.height,
        ratio: aiInfo.ratio,
      },

      final: {
        width: finalResult.width,
        height: finalResult.height,
        ratio: finalResult.ratio,
      },

      pipeline: "AI_EXPAND_TO_PRINT_RATIO",
    });
  } catch (error) {
    console.error("EDIT API ERROR:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Có lỗi xảy ra khi xử lý ảnh.",
    });
  }
}
