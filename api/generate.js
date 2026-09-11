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

function getOutputSize(layoutType) {
  switch (layoutType) {
    case "ULTRA_TALL":
    case "PORTRAIT":
      return "1024x1536";

    case "SQUARE":
      return "1024x1024";

    case "ULTRA_WIDE":
    case "WIDE":
    case "LANDSCAPE":
    default:
      return "1536x1024";
  }
}

async function getImageInfo(base64Image) {
  const buffer = Buffer.from(base64Image, "base64");

  const metadata = await sharp(buffer).metadata();

  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
    ratio:
      metadata.width && metadata.height
        ? metadata.width / metadata.height
        : 0,
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
      designType = "Backdrop",
      width,
      height,
      unit = "cm",
      prompt = "",
      style = "Hiện đại",
    } = req.body || {};

    const targetWidth = Number(width);
    const targetHeight = Number(height);

    if (
      !Number.isFinite(targetWidth) ||
      !Number.isFinite(targetHeight) ||
      targetWidth <= 0 ||
      targetHeight <= 0
    ) {
      return res.status(400).json({
        error: "Kích thước thiết kế không hợp lệ.",
      });
    }

    const targetRatio = targetWidth / targetHeight;

    const layoutType = getLayoutType(
      targetWidth,
      targetHeight
    );

    const outputSize = getOutputSize(layoutType);

    /*
     * SPECIAL FORMAT:
     * ULTRA-WIDE LARGE-FORMAT ADVERTISING BANNER
     *
     * Với những thiết kế như 400 x 70 cm,
     * AI sẽ tạo artwork trung gian trước.
     *
     * Sau đó /api/edit sẽ mở rộng artwork
     * thành đúng tỷ lệ in thực tế.
     */

    let formatInstruction = "";

    if (layoutType === "ULTRA_WIDE") {
      formatInstruction = `
SPECIAL FORMAT: ULTRA-WIDE LARGE-FORMAT ADVERTISING BANNER

The requested document is extremely wide.

TARGET DOCUMENT:
${targetWidth} × ${targetHeight} ${unit}

TARGET RATIO:
${targetRatio.toFixed(4)} : 1

Create the main artwork as a professional advertising composition
with the important visual elements concentrated in a safe central area.

IMPORTANT:

- Do not place critical text near the extreme left or right edges.
- Do not stretch people or products.
- Do not distort logos.
- Do not create extremely small typography.
- Leave visual background areas that can naturally continue outward.
- The background must be expandable later by an AI outpainting process.
- Keep the composition visually balanced.
- Do not add random text.
- Do not add watermarks.

The artwork is an intermediate design that will later be expanded
to the final ultra-wide print ratio.
`;
    } else if (layoutType === "WIDE") {
      formatInstruction = `
WIDE ADVERTISING FORMAT

TARGET DOCUMENT:
${targetWidth} × ${targetHeight} ${unit}

TARGET RATIO:
${targetRatio.toFixed(4)} : 1

Create a balanced wide advertising composition.

Keep important typography, logos, people and products away from
the extreme edges so the composition remains safe for printing.
`;
    } else if (layoutType === "ULTRA_TALL") {
      formatInstruction = `
ULTRA-TALL PRINT FORMAT

TARGET DOCUMENT:
${targetWidth} × ${targetHeight} ${unit}

TARGET RATIO:
${targetRatio.toFixed(4)} : 1

Create a vertical advertising composition with a strong central hierarchy.
`;
    } else {
      formatInstruction = `
STANDARD PRINT FORMAT

TARGET DOCUMENT:
${targetWidth} × ${targetHeight} ${unit}

TARGET RATIO:
${targetRatio.toFixed(4)} : 1

Create a professional advertising composition suitable for large-format
printing.
`;
    }

    const designPrompt = `
You are a professional advertising graphic designer.

Create a high-quality commercial advertising artwork.

DESIGN TYPE:
${designType}

SIZE:
${targetWidth} × ${targetHeight} ${unit}

STYLE:
${style}

USER BRIEF:
${prompt}

${formatInstruction}

GENERAL DESIGN REQUIREMENTS:

- Professional advertising design
- Strong visual hierarchy
- Clean composition
- High visual impact
- Suitable for commercial printing
- Professional typography
- Good spacing
- Clear focal point
- Balanced colors
- No unnecessary objects
- No random text
- No watermark
- No distorted people
- No distorted products
- No distorted logos

The final artwork must look professionally designed rather than like
a generic AI image.

IMPORTANT:
This is the first stage of a two-stage design pipeline.

For extreme aspect ratios, create a strong central composition with
background elements that can be naturally expanded later.

Do NOT attempt to squeeze the entire ultra-wide document into a normal
image ratio.
`;

    console.log("GENERATE REQUEST", {
      designType,
      targetWidth,
      targetHeight,
      unit,
      targetRatio,
      layoutType,
      outputSize,
    });

    const response = await openai.images.generate({
      model: "gpt-image-2",
      prompt: designPrompt,
      size: outputSize,
      quality: "high",
    });

    const resultBase64 =
      response?.data?.[0]?.b64_json;

    if (!resultBase64) {
      throw new Error(
        "AI không trả về dữ liệu hình ảnh."
      );
    }

    const imageInfo =
      await getImageInfo(resultBase64);

    const requiresAspectProcessing =
      layoutType === "ULTRA_WIDE" ||
      layoutType === "WIDE" ||
      layoutType === "ULTRA_TALL";

    const ratioDifference =
      targetRatio > 0 && imageInfo.ratio > 0
        ? Math.abs(imageInfo.ratio - targetRatio) /
          targetRatio
        : 0;

    return res.status(200).json({
      image: `data:image/png;base64,${resultBase64}`,

      width: targetWidth,
      height: targetHeight,
      unit,

      aspectRatio: targetRatio,

      layoutType,

      sourceWidth: imageInfo.width,
      sourceHeight: imageInfo.height,
      sourceAspectRatio: imageInfo.ratio,

      outputSize,

      requiresAspectProcessing,

      ratioDifference,

      pipeline:
        "GENERATE_INTERMEDIATE_ARTWORK_THEN_AI_ASPECT_EXPANSION",
    });
  } catch (error) {
    console.error("GENERATE API ERROR:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Không thể tạo thiết kế.",
    });
  }
}
