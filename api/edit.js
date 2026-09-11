import OpenAI from "openai";
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

  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);

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

/*
 * Tạo một canvas làm việc theo tỷ lệ đích.
 *
 * Ví dụ:
 * 400 x 70
 * => tỷ lệ 5.714:1
 *
 * Ảnh gốc được đặt vào giữa và KHÔNG bị kéo méo.
 * Phần còn thiếu hai bên được để trong suốt để AI có
 * không gian mở rộng thiết kế.
 */
async function createExpansionCanvas(
  sourceBuffer,
  targetWidth,
  targetHeight
) {
  const sourceInfo = await getImageInfo(sourceBuffer);

  const targetRatio = targetWidth / targetHeight;

  const maxCanvasWidth = 1536;
  const canvasHeight = Math.max(
    256,
    Math.round(maxCanvasWidth / targetRatio)
  );

  const canvasWidth = maxCanvasWidth;

  let resizedWidth;
  let resizedHeight;

  if (sourceInfo.ratio > targetRatio) {
    /*
     * Ảnh nguồn tương đối ngang.
     * Giữ toàn bộ chiều rộng và thu chiều cao.
     */
    resizedWidth = canvasWidth;
    resizedHeight = Math.round(canvasWidth / sourceInfo.ratio);
  } else {
    /*
     * Ảnh nguồn cao hơn.
     * Giữ toàn bộ chiều cao phù hợp.
     */
    resizedHeight = canvasHeight;
    resizedWidth = Math.round(canvasHeight * sourceInfo.ratio);
  }

  const resized = await sharp(sourceBuffer)
    .resize(resizedWidth, resizedHeight, {
      fit: "fill",
    })
    .png()
    .toBuffer();

  const left = Math.round((canvasWidth - resizedWidth) / 2);
  const top = Math.round((canvasHeight - resizedHeight) / 2);

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

/*
 * Khi AI trả về ảnh chuẩn của model, chúng ta kiểm tra lại.
 *
 * Không bao giờ resize kiểu "fill" để ép người / sản phẩm /
 * logo / chữ bị méo.
 *
 * Với ảnh siêu ngang, phần cuối sẽ được tạo thành canvas
 * đúng tỷ lệ bằng cách giữ nguyên nội dung chính.
 */
async function createExactRatioImage(
  aiBuffer,
  targetWidth,
  targetHeight
) {
  const aiInfo = await getImageInfo(aiBuffer);

  const targetRatio = targetWidth / targetHeight;

  /*
   * Kích thước pixel xuất cuối.
   *
   * Không dùng kích thước centimet trực tiếp vì PNG
   * cần kích thước pixel thực tế.
   */
  const finalWidth = 2400;
  const finalHeight = Math.max(
    1,
    Math.round(finalWidth / targetRatio)
  );

  /*
   * Scale ảnh AI xuống theo chiều cao của vùng trung tâm.
   * Không làm biến dạng.
   */
  const maxCenterWidth = Math.min(
    finalWidth,
    Math.round(finalHeight * aiInfo.ratio)
  );

  const center = await sharp(aiBuffer)
    .resize({
      width: maxCenterWidth,
      height: finalHeight,
      fit: "contain",
      background: {
        r: 255,
        g: 255,
        b: 255,
        alpha: 0,
      },
    })
    .png()
    .toBuffer();

  const centerInfo = await getImageInfo(center);

  const leftWidth = Math.max(
    0,
    Math.floor((finalWidth - centerInfo.width) / 2)
  );

  const rightWidth =
    finalWidth - centerInfo.width - leftWidth;

  /*
   * Lấy màu/texture mép ảnh để tạo phần nền mở rộng.
   * Không kéo giãn nội dung chính.
   */
  const leftBackground =
    leftWidth > 0
      ? await sharp(aiBuffer)
          .extract({
            left: 0,
            top: 0,
            width: 1,
            height: aiInfo.height,
          })
          .resize(leftWidth, finalHeight, {
            fit: "cover",
          })
          .blur(8)
          .png()
          .toBuffer()
      : null;

  const rightBackground =
    rightWidth > 0
      ? await sharp(aiBuffer)
          .extract({
            left: Math.max(0, aiInfo.width - 1),
            top: 0,
            width: 1,
            height: aiInfo.height,
          })
          .resize(rightWidth, finalHeight, {
            fit: "cover",
          })
          .blur(8)
          .png()
          .toBuffer()
      : null;

  const compositeItems = [];

  if (leftBackground) {
    compositeItems.push({
      input: leftBackground,
      left: 0,
      top: 0,
    });
  }

  compositeItems.push({
    input: center,
    left: leftWidth,
    top: 0,
  });

  if (rightBackground) {
    compositeItems.push({
      input: rightBackground,
      left: leftWidth + centerInfo.width,
      top: 0,
    });
  }

  const finalBuffer = await sharp({
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
  })
    .composite(compositeItems)
    .png()
    .toBuffer();

  return {
    buffer: finalBuffer,
    width: finalWidth,
    height: finalHeight,
    ratio: finalWidth / finalHeight,
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

    const finalTargetWidth = Number(targetWidth || width);
    const finalTargetHeight = Number(targetHeight || height);

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
    const sourceInfo = await getImageInfo(sourceBuffer);

    const targetRatio =
      finalTargetWidth / finalTargetHeight;

    const layoutType = getLayoutType(
      finalTargetWidth,
      finalTargetHeight
    );

    /*
     * Prompt chuyên dụng cho việc mở rộng tỷ lệ.
     */
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
Expand the existing artwork naturally so it can be used for the target
advertising print layout.

CRITICAL RULES:

1. NEVER stretch or squash the original artwork.

2. NEVER distort:
- people
- faces
- bodies
- products
- vehicles
- logos
- typography
- symbols
- objects

3. Keep the important original design elements together in the safe central
area.

4. Extend the visual environment naturally into the empty areas.

5. The extension must look like it belongs to the SAME ORIGINAL DESIGN.

6. Continue:
- background
- gradients
- lighting
- decorative shapes
- architectural elements
- scenery
- patterns
- textures
- colors

7. Do NOT simply duplicate the original image.

8. Do NOT mirror the original image.

9. Do NOT create obvious repeating patterns.

10. Do NOT create white empty strips.

11. Do NOT put blurred side panels around the original design.

12. Do NOT move important typography or logos into the expansion area.

13. Do NOT add random text.

14. Do NOT add watermarks.

15. Preserve the original visual identity.

The final result should look as if the original designer created the complete
wide advertising layout from the beginning.

${editPrompt}
`;

    /*
     * Tạo canvas trung gian theo tỷ lệ đích.
     */
    const expansionCanvas = await createExpansionCanvas(
      sourceBuffer,
      finalTargetWidth,
      finalTargetHeight
    );

    const workingImage =
      bufferToDataUrl(expansionCanvas.buffer);

    /*
     * Gửi canvas đã chuẩn bị cho AI.
     */
    const response = await openai.images.edit({
      model: "gpt-image-2.5-sunburst",
      image: workingImage,
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

    const aiInfo = await getImageInfo(aiBuffer);

    /*
     * Tạo file PNG cuối cùng theo đúng tỷ lệ tài liệu.
     */
    const finalResult = await createExactRatioImage(
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
