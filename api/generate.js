import OpenAI from "openai";
import sharp from "sharp";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const {
      designType = "Backdrop",
      width = 300,
      height = 270,
      unit = "cm",
      prompt = "",
      style = "Hiện đại",
    } = req.body || {};

    const w = Number(width);
    const h = Number(height);

    if (!w || !h || w <= 0 || h <= 0) {
      return res.status(400).json({
        error: "Kích thước thiết kế không hợp lệ.",
      });
    }

    const aspectRatio = w / h;

    /*
     * Phân loại tỷ lệ thiết kế
     */
    let layoutType = "SQUARE";

    if (aspectRatio >= 4) {
      layoutType = "ULTRA_WIDE";
    } else if (aspectRatio >= 2) {
      layoutType = "WIDE";
    } else if (aspectRatio >= 1.15) {
      layoutType = "LANDSCAPE";
    } else if (aspectRatio <= 0.5) {
      layoutType = "ULTRA_TALL";
    } else if (aspectRatio <= 0.87) {
      layoutType = "PORTRAIT";
    }

    /*
     * Chọn kích thước ảnh AI phù hợp.
     *
     * Lưu ý:
     * GPT Image không phải lúc nào cũng tạo trực tiếp
     * được tỷ lệ cực rộng như 400:70.
     *
     * Vì vậy với banner cực rộng, ta tạo artwork nền
     * theo hướng landscape trước, sau đó bước xử lý
     * tiếp theo sẽ dùng Sharp + AI edit để hoàn thiện
     * tỷ lệ thật.
     */
    let outputSize = "1536x1024";

    if (layoutType === "PORTRAIT" || layoutType === "ULTRA_TALL") {
      outputSize = "1024x1536";
    } else if (layoutType === "SQUARE") {
      outputSize = "1024x1024";
    } else {
      outputSize = "1536x1024";
    }

    /*
     * Hướng dẫn bố cục cho AI
     */
    let layoutInstruction = "";

    if (layoutType === "ULTRA_WIDE") {
      layoutInstruction = `
ULTRA-WIDE PRINT BANNER.

The requested physical design ratio is approximately:
${w}:${h} ${unit}
= ${aspectRatio.toFixed(3)}:1.

This is an extremely wide advertising banner.

IMPORTANT COMPOSITION RULES:
- Design for a very wide horizontal advertising format.
- Keep the main subject, people, logo and important text concentrated around the central safe area.
- Use generous empty/background space toward the left and right sides.
- Extend scenery, gradients, lighting, decorative elements and background naturally toward both sides.
- Do NOT place important objects close to the top or bottom edge.
- Do NOT create a tall poster composition.
- Do NOT squeeze the design vertically.
- Do NOT stretch people, products, logos or typography.
- The composition must visually feel like a professional large-format outdoor advertising banner.
- Leave enough visual flexibility for later horizontal AI expansion.
`;
    } else if (layoutType === "WIDE") {
      layoutInstruction = `
WIDE HORIZONTAL PRINT DESIGN.

Requested ratio:
${aspectRatio.toFixed(3)}:1.

Use a horizontal advertising composition.
Keep important subjects and typography well balanced.
Avoid placing critical elements near the edges.
Use background space intelligently.
`;
    } else if (
      layoutType === "PORTRAIT" ||
      layoutType === "ULTRA_TALL"
    ) {
      layoutInstruction = `
VERTICAL PRINT DESIGN.

Requested ratio:
${aspectRatio.toFixed(3)}:1.

Use a professional vertical advertising composition.
Keep important text and subjects inside a safe central area.
Do not crop important elements.
`;
    } else {
      layoutInstruction = `
BALANCED PRINT DESIGN.

Requested ratio:
${aspectRatio.toFixed(3)}:1.

Create a balanced professional advertising composition.
`;
    }

    /*
     * Prompt chính
     */
    const designPrompt = `
You are a professional advertising graphic designer specializing
in large-format printing, backdrops, banners, signs and commercial
advertising layouts.

Create a polished professional advertising design.

DESIGN TYPE:
${designType}

PHYSICAL SIZE:
${w} × ${h} ${unit}

TARGET ASPECT RATIO:
${aspectRatio.toFixed(4)}:1

STYLE:
${style}

USER CONTENT:
${prompt || "Create an attractive professional design suitable for printing."}

${layoutInstruction}

GENERAL DESIGN RULES:

1. Create a professional commercial advertising layout.
2. Make the design visually attractive and immediately readable.
3. Use strong visual hierarchy.
4. Keep important text highly legible.
5. Use appropriate typography for large-format printing.
6. Maintain clean spacing and alignment.
7. Keep the main subject visually clear.
8. Do not overcrowd the composition.
9. Do not create unnecessary objects.
10. Do not distort people, products, logos or text.
11. Do not use random unreadable pseudo-text.
12. Avoid placing critical information too close to the edges.
13. Design with large-format printing in mind.
14. Maintain clean professional edges.
15. The result should look like work produced by a professional advertising designer.

IMPORTANT FOR EXTREME RATIOS:

When the requested design is extremely wide or extremely tall,
do not try to force all content into a normal poster composition.

Instead:
- simplify the central composition,
- keep the main visual elements in a safe area,
- use expandable background areas,
- allow scenery, gradients, lighting and decorative elements
  to continue naturally,
- avoid critical details at the extreme edges.

The final artwork must be suitable for further aspect-ratio
processing without stretching or distorting the actual design elements.

Generate the best possible professional advertising artwork.
`;

    console.log("GENERATE REQUEST:", {
      designType,
      width: w,
      height: h,
      unit,
      style,
      aspectRatio,
      layoutType,
      outputSize,
    });

    const response = await openai.images.generate({
      model: "gpt-image-2",
      prompt: designPrompt,
      size: outputSize,
      quality: "medium",
    });

    const imageBase64 = response.data?.[0]?.b64_json;

    if (!imageBase64) {
      throw new Error("OpenAI không trả về ảnh.");
    }

    /*
     * Kiểm tra kích thước ảnh thực tế bằng Sharp.
     */
    const inputBuffer = Buffer.from(imageBase64, "base64");

    const metadata = await sharp(inputBuffer).metadata();

    const sourceWidth = metadata.width || 0;
    const sourceHeight = metadata.height || 0;

    /*
     * Tỷ lệ thực tế của ảnh AI
     */
    const sourceAspectRatio =
      sourceHeight > 0
        ? sourceWidth / sourceHeight
        : 0;

    console.log("GENERATED IMAGE:", {
      sourceWidth,
      sourceHeight,
      sourceAspectRatio,
      targetAspectRatio: aspectRatio,
    });

    return res.status(200).json({
      image: `data:image/png;base64,${imageBase64}`,

      width: w,
      height: h,
      unit,

      aspectRatio,
      layoutType,

      sourceWidth,
      sourceHeight,
      sourceAspectRatio,

      outputSize,
    });

  } catch (error) {
    console.error("GENERATE ERROR:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Không thể tạo thiết kế AI.",
    });
  }
}
