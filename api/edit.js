```javascript
import OpenAI from "openai";
import sharp from "sharp";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/*
  AI DESIGN PRINT
  Image editing / aspect-ratio expansion engine

  Mục tiêu:
  - Không bóp méo ảnh gốc.
  - Không dùng nền blur làm phần mở rộng.
  - Với banner siêu ngang như 400x70:
      1. tạo canvas đúng tỷ lệ
      2. đặt artwork gốc vào vùng trung tâm
      3. dùng AI để mở rộng nội dung sang hai bên
      4. kiểm tra lại tỷ lệ
      5. xuất PNG đúng tỷ lệ
*/

function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") {
    throw new Error("Ảnh đầu vào không hợp lệ.");
  }

  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);

  if (!match) {
    throw new Error("Ảnh phải là Data URL dạng base64.");
  }

  return {
    format: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function normalizeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function calculateRatio(width, height) {
  return width / height;
}

function getLayout(width, height) {
  const ratio = calculateRatio(width, height);

  if (ratio >= 4) return "ULTRA_WIDE";
  if (ratio >= 2) return "WIDE";
  if (ratio <= 0.5) return "ULTRA_TALL";
  if (ratio <= 0.87) return "PORTRAIT";

  return "NORMAL";
}

function chooseWorkingCanvas(width, height) {
  const ratio = width / height;

  /*
    Không tạo canvas quá lớn cho API.
    Giữ đúng tỷ lệ nhưng đủ lớn để AI nhìn thấy bố cục.

    Ví dụ:
      400 x 70 -> 1536 x 269
      300 x 270 -> 1024 x 922
      70 x 400 -> 269 x 1536
  */

  if (ratio >= 1) {
    const canvasWidth = 1536;
    const canvasHeight = Math.max(256, Math.round(canvasWidth / ratio));

    return {
      width: canvasWidth,
      height: canvasHeight,
    };
  }

  const canvasHeight = 1536;
  const canvasWidth = Math.max(256, Math.round(canvasHeight * ratio));

  return {
    width: canvasWidth,
    height: canvasHeight,
  };
}

async function makeExpansionCanvas(inputBuffer, targetWidth, targetHeight) {
  const metadata = await sharp(inputBuffer).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Không đọc được kích thước ảnh gốc.");
  }

  const targetRatio = targetWidth / targetHeight;
  const sourceRatio = metadata.width / metadata.height;

  /*
    Artwork trung tâm.
    Với banner siêu rộng, giữ nguyên tỷ lệ artwork,
    chỉ thu nhỏ để vừa chiều cao canvas.
  */

  let artworkWidth;
  let artworkHeight;

  if (sourceRatio >= targetRatio) {
    artworkWidth = targetWidth;
    artworkHeight = Math.round(targetWidth / sourceRatio);
  } else {
    artworkHeight = targetHeight;
    artworkWidth = Math.round(targetHeight * sourceRatio);
  }

  /*
    Không để artwork sát mép.
    Với banner siêu rộng, artwork được đặt giữa
    để AI có không gian mở rộng hai bên.
  */

  const maxArtworkWidth = Math.round(targetWidth * 0.72);

  if (artworkWidth > maxArtworkWidth) {
    artworkWidth = maxArtworkWidth;
    artworkHeight = Math.round(artworkWidth / sourceRatio);
  }

  const resizedArtwork = await sharp(inputBuffer)
    .resize({
      width: artworkWidth,
      height: artworkHeight,
      fit: "fill",
    })
    .png()
    .toBuffer();

  const left = Math.floor((targetWidth - artworkWidth) / 2);
  const top = Math.floor((targetHeight - artworkHeight) / 2);

  /*
    Canvas trắng/transparent để AI nhìn thấy vùng cần mở rộng.
    Không dùng blur.
  */

  const canvas = await sharp({
    create: {
      width: targetWidth,
      height: targetHeight,
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
        input: resizedArtwork,
        left,
        top,
      },
    ])
    .png()
    .toBuffer();

  return {
    buffer: canvas,
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    artworkWidth,
    artworkHeight,
  };
}

async function getImageBufferFromOpenAI(response) {
  const item = response?.data?.[0];

  if (!item) {
    throw new Error("OpenAI không trả về ảnh.");
  }

  if (item.b64_json) {
    return Buffer.from(item.b64_json, "base64");
  }

  if (item.url) {
    const imageResponse = await fetch(item.url);

    if (!imageResponse.ok) {
      throw new Error("Không tải được ảnh kết quả từ OpenAI.");
    }

    return Buffer.from(await imageResponse.arrayBuffer());
  }

  throw new Error("Không tìm thấy dữ liệu ảnh trong phản hồi OpenAI.");
}

async function forceExactRatio(inputBuffer, targetWidth, targetHeight) {
  /*
    Chỉ điều chỉnh CANVAS cuối cùng.
    Không kéo giãn artwork.

    Nếu AI trả về ảnh có tỷ lệ hơi lệch,
    ảnh được cover/crop tối thiểu để canvas cuối
    đạt đúng tỷ lệ mục tiêu.
  */

  const targetRatio = targetWidth / targetHeight;

  const metadata = await sharp(inputBuffer).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Không đọc được kích thước ảnh AI.");
  }

  const currentRatio = metadata.width / metadata.height;

  if (Math.abs(currentRatio - targetRatio) / targetRatio < 0.01) {
    return sharp(inputBuffer).png().toBuffer();
  }

  /*
    Tạo canvas đúng tỷ lệ.
    Không stretch.
  */

  const finalWidth = 2400;
  const finalHeight = Math.max(
    256,
    Math.round(finalWidth / targetRatio)
  );

  return sharp(inputBuffer)
    .resize({
      width: finalWidth,
      height: finalHeight,
      fit: "cover",
      position: "centre",
    })
    .png()
    .toBuffer();
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
      editPrompt,
      targetWidth,
      targetHeight,
      width,
      height,
      designType,
      style,
    } = req.body || {};

    const requestedWidth =
      normalizeNumber(targetWidth) || normalizeNumber(width);

    const requestedHeight =
      normalizeNumber(targetHeight) || normalizeNumber(height);

    if (!image) {
      return res.status(400).json({
        error: "Thiếu ảnh đầu vào.",
      });
    }

    if (!requestedWidth || !requestedHeight) {
      return res.status(400).json({
        error: "Thiếu kích thước chiều rộng hoặc chiều cao.",
      });
    }

    const { buffer: inputBuffer } = parseDataUrl(image);

    const targetRatio = calculateRatio(
      requestedWidth,
      requestedHeight
    );

    const layout = getLayout(
      requestedWidth,
      requestedHeight
    );

    const workingCanvas = chooseWorkingCanvas(
      requestedWidth,
      requestedHeight
    );

    /*
      Nếu là tỷ lệ cực rộng/cực cao:
      chuẩn bị một canvas đã có đúng tỷ lệ.
    */

    let aiInputBuffer = inputBuffer;
    let expansionInfo = null;

    if (
      layout === "ULTRA_WIDE" ||
      layout === "WIDE" ||
      layout === "ULTRA_TALL"
    ) {
      const prepared = await makeExpansionCanvas(
        inputBuffer,
        workingCanvas.width,
        workingCanvas.height
      );

      aiInputBuffer = prepared.buffer;
      expansionInfo = prepared;
    }

    const basePrompt =
      editPrompt ||
      "Expand and refine this advertising design while preserving the original design identity.";

    const aiPrompt = `
You are the professional image expansion and advertising-layout engine
for AI DESIGN PRINT.

TARGET DESIGN
- Design type: ${designType || "Advertising design"}
- Style: ${style || "Professional"}
- Target physical size: ${requestedWidth} x ${requestedHeight}
- Target aspect ratio: ${targetRatio.toFixed(6)} : 1
- Layout classification: ${layout}

USER REQUEST
${basePrompt}

CRITICAL INSTRUCTIONS

1. Preserve the original artwork in the central area.
2. NEVER stretch, squash, deform, or distort:
   - people
   - faces
   - products
   - logos
   - letters
   - typography
   - important objects
3. For an ultra-wide banner, EXTEND THE ACTUAL DESIGN ENVIRONMENT
   naturally to the left and right.
4. Continue:
   - background
   - walls
   - gradients
   - lighting
   - decorative elements
   - textures
   - scenery
   - advertising atmosphere
   from the original artwork.
5. The expanded areas must look like they were originally designed
   as part of the same banner.
6. Do NOT create blurred side panels.
7. Do NOT mirror the artwork.
8. Do NOT simply duplicate the central image.
9. Do NOT place a white or empty strip on either side.
10. Do NOT crop important content.
11. Maintain clean professional advertising composition.
12. Keep the important text and logo inside a safe central area.
13. The final artwork must visually read as ONE continuous design.
14. The final image must follow the requested aspect ratio as closely
    as the image generation/editing system allows.

For a 400 x 70 cm banner specifically:
- Think of the composition as a real physical 400 cm wide banner.
- The left and right sides must contain real continuation of the design.
- The result must NOT look like a normal landscape image placed inside
  a long white frame.

Return only the edited image.
`;

    /*
      GPT-Image-2.5 Sunburst:
      OpenAI currently documents it as its most capable image
      generation/editing model and supports the image edit endpoint.
    */

    const response = await openai.images.edit({
      model: "gpt-image-2.5-sunburst",
      image: aiInputBuffer,
      prompt: aiPrompt,
      size: "auto",
      quality: "high",
    });

    const aiOutputBuffer =
      await getImageBufferFromOpenAI(response);

    const aiMetadata =
      await sharp(aiOutputBuffer).metadata();

    if (!aiMetadata.width || !aiMetadata.height) {
      throw new Error(
        "Không đọc được kích thước ảnh AI trả về."
      );
    }

    /*
      Chỉ ép CANVAS về đúng tỷ lệ nếu AI trả về lệch.
      Không dùng blur background.
    */

    const finalBuffer = await forceExactRatio(
      aiOutputBuffer,
      requestedWidth,
      requestedHeight
    );

    const finalMetadata =
      await sharp(finalBuffer).metadata();

    if (!finalMetadata.width || !finalMetadata.height) {
      throw new Error(
        "Không đọc được kích thước ảnh cuối."
      );
    }

    const finalRatio =
      finalMetadata.width / finalMetadata.height;

    /*
      Kiểm tra cuối.
    */

    const ratioDifference =
      Math.abs(finalRatio - targetRatio) / targetRatio;

    if (ratioDifference > 0.015) {
      throw new Error(
        `Ảnh cuối chưa đạt đúng tỷ lệ mục tiêu. ` +
        `Target: ${targetRatio.toFixed(4)}, ` +
        `Final: ${finalRatio.toFixed(4)}`
      );
    }

    const finalBase64 =
      finalBuffer.toString("base64");

    return res.status(200).json({
      image: `data:image/png;base64,${finalBase64}`,

      target: {
        width: requestedWidth,
        height: requestedHeight,
        ratio: targetRatio,
      },

      layoutType: layout,

      workingCanvas: {
        width: workingCanvas.width,
        height: workingCanvas.height,
        ratio:
          workingCanvas.width /
          workingCanvas.height,
      },

      source: {
        width:
          expansionInfo?.sourceWidth ||
          aiMetadata.width,
        height:
          expansionInfo?.sourceHeight ||
          aiMetadata.height,
      },

      aiOutput: {
        width: aiMetadata.width,
        height: aiMetadata.height,
        ratio:
          aiMetadata.width /
          aiMetadata.height,
      },

      final: {
        width: finalMetadata.width,
        height: finalMetadata.height,
        ratio: finalRatio,
      },

      message:
        "AI DESIGN PRINT: ảnh đã được xử lý theo tỷ lệ thiết kế.",
    });
  } catch (error) {
    console.error("AI DESIGN PRINT edit error:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Không thể xử lý ảnh.",
    });
  }
}
```
