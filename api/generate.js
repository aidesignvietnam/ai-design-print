```javascript
import OpenAI from "openai";
import sharp from "sharp";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function classifyLayout(aspectRatio) {
  if (aspectRatio >= 4) return "ULTRA_WIDE";
  if (aspectRatio >= 2) return "WIDE";
  if (aspectRatio >= 1.15) return "LANDSCAPE";
  if (aspectRatio <= 0.5) return "ULTRA_TALL";
  if (aspectRatio <= 0.87) return "PORTRAIT";
  return "SQUARE";
}

function getOutputSize(layoutType) {
  /*
   * GPT Image có các kích thước chuẩn cho generation.
   *
   * Với banner cực rộng:
   * KHÔNG cố ép model tạo 400:70 trực tiếp ở bước đầu.
   *
   * Chúng ta tạo artwork chất lượng cao trước,
   * sau đó main.jsx -> edit.js sẽ xử lý expansion.
   */

  if (layoutType === "PORTRAIT" || layoutType === "ULTRA_TALL") {
    return "1024x1536";
  }

  if (layoutType === "SQUARE") {
    return "1024x1024";
  }

  return "1536x1024";
}

function buildLayoutInstruction({
  layoutType,
  width,
  height,
  unit,
  aspectRatio,
}) {
  if (layoutType === "ULTRA_WIDE") {
    return `
SPECIAL FORMAT: ULTRA-WIDE LARGE-FORMAT ADVERTISING BANNER

Physical target:
${width} × ${height} ${unit}

Target aspect ratio:
${aspectRatio.toFixed(4)}:1

This is an extremely wide physical banner.

The first artwork is an intermediate artwork that will later be
expanded horizontally by an AI image-editing stage.

IMPORTANT:

- Think like a professional large-format advertising designer.
- Build a strong central visual composition.
- Keep the main subject visually clear.
- Keep important typography and logos inside a safe central zone.
- Do not put critical information near the extreme left or right edges.
- Do not create a vertical poster composition.
- Do not make the central subject extremely tall.
- Do not stretch or distort people, products, logos or objects.
- Use a background that can naturally continue horizontally.
- Use gradients, lighting, walls, scenery, textures, decorative shapes
  or environmental elements that can be continued naturally.
- Avoid complicated objects touching the outer edges.
- Leave visual breathing room around the main subject.
- The artwork must feel like the central section of a much wider banner.
- Do not create obvious empty white margins.
- Do not put important text in the areas that will later be expanded.

The later expansion stage must be able to continue the background
naturally to the left and right.
`;
  }

  if (layoutType === "WIDE") {
    return `
SPECIAL FORMAT: WIDE HORIZONTAL PRINT DESIGN

Target physical size:
${width} × ${height} ${unit}

Target ratio:
${aspectRatio.toFixed(4)}:1

Create a professional horizontal advertising composition.

Keep:
- main subject clear
- typography readable
- logo protected
- background visually expandable
- important information away from extreme edges

Do not distort people, products, logos or text.
`;
  }

  if (
    layoutType === "PORTRAIT" ||
    layoutType === "ULTRA_TALL"
  ) {
    return `
SPECIAL FORMAT: VERTICAL PRINT DESIGN

Target physical size:
${width} × ${height} ${unit}

Target ratio:
${aspectRatio.toFixed(4)}:1

Create a professional vertical advertising composition.

Keep important text, logo and subjects inside a safe central area.
Do not crop important information.
Do not distort people or products.
`;
  }

  if (layoutType === "LANDSCAPE") {
    return `
SPECIAL FORMAT: LANDSCAPE PRINT DESIGN

Target physical size:
${width} × ${height} ${unit}

Target ratio:
${aspectRatio.toFixed(4)}:1

Create a professional horizontal advertising composition.

Use balanced spacing and strong visual hierarchy.
Keep important information away from the extreme edges.
`;
  }

  return `
SPECIAL FORMAT: BALANCED PRINT DESIGN

Target physical size:
${width} × ${height} ${unit}

Target ratio:
${aspectRatio.toFixed(4)}:1

Create a balanced professional advertising composition.
`;
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
      width = 300,
      height = 270,
      unit = "cm",
      prompt = "",
      style = "Hiện đại",
    } = req.body || {};

    const w = Number(width);
    const h = Number(height);

    if (
      !Number.isFinite(w) ||
      !Number.isFinite(h) ||
      w <= 0 ||
      h <= 0
    ) {
      return res.status(400).json({
        error: "Kích thước thiết kế không hợp lệ.",
      });
    }

    const aspectRatio = w / h;

    const layoutType = classifyLayout(aspectRatio);

    const outputSize = getOutputSize(layoutType);

    const layoutInstruction = buildLayoutInstruction({
      layoutType,
      width: w,
      height: h,
      unit,
      aspectRatio,
    });

    const designPrompt = `
You are the professional advertising design engine
inside AI DESIGN PRINT.

Create a polished commercial advertising artwork intended
for professional large-format printing.

DESIGN TYPE:
${designType}

PHYSICAL SIZE:
${w} × ${h} ${unit}

TARGET ASPECT RATIO:
${aspectRatio.toFixed(4)}:1

STYLE:
${style}

USER CONTENT:
${prompt || "Create an attractive professional advertising design suitable for printing."}

${layoutInstruction}

PROFESSIONAL DESIGN REQUIREMENTS:

1. Create a real advertising composition, not generic artwork.
2. Make the main visual immediately understandable.
3. Use strong visual hierarchy.
4. Make typography clean and readable.
5. Use professional spacing and alignment.
6. Keep important information visually protected.
7. Do not overcrowd the design.
8. Do not add irrelevant objects.
9. Do not distort people.
10. Do not distort products.
11. Do not distort logos.
12. Do not create unreadable fake text.
13. Do not put important text directly against an edge.
14. Avoid unnecessary frames around the entire artwork.
15. Use professional commercial color relationships.
16. Design for large-format printing and viewing from a distance.
17. Keep the artwork visually polished and production-oriented.

IMPORTANT IMAGE-COMPOSITION RULE:

For extreme aspect ratios, especially ULTRA_WIDE,
this image is an INTERMEDIATE ARTWORK.

The next stage of AI DESIGN PRINT will expand the artwork
to the user's exact physical aspect ratio.

Therefore:

- Preserve a strong central composition.
- Preserve the identity of the requested design.
- Make the background visually continuous.
- Avoid critical information at the far left and right.
- Avoid hard borders at the left and right.
- Avoid a composition that would look broken if extended horizontally.
- Do not create a white frame.
- Do not create a fake blank canvas.
- Do not compress the entire requested design into a small object.

The result must look like a professional advertising design
created by a human graphic designer.

Generate the best possible artwork.
`;

    console.log("AI DESIGN PRINT GENERATE:", {
      designType,
      width: w,
      height: h,
      unit,
      style,
      aspectRatio,
      layoutType,
      outputSize,
    });

    /*
     * Generation stage.
     *
     * We deliberately use a strong standard generation canvas.
     * Extreme aspect-ratio expansion is handled by edit.js.
     */

    const response = await openai.images.generate({
      model: "gpt-image-2",
      prompt: designPrompt,
      size: outputSize,
      quality: "high",
    });

    const imageBase64 = response.data?.[0]?.b64_json;

    if (!imageBase64) {
      throw new Error(
        "OpenAI không trả về dữ liệu ảnh."
      );
    }

    const imageBuffer = Buffer.from(
      imageBase64,
      "base64"
    );

    const metadata = await sharp(imageBuffer).metadata();

    const sourceWidth = metadata.width || 0;
    const sourceHeight = metadata.height || 0;

    if (!sourceWidth || !sourceHeight) {
      throw new Error(
        "Không đọc được kích thước ảnh AI."
      );
    }

    const sourceAspectRatio =
      sourceWidth / sourceHeight;

    const ratioDifference =
      Math.abs(sourceAspectRatio - aspectRatio) /
      aspectRatio;

    /*
     * Chúng ta KHÔNG sửa méo ảnh tại đây.
     *
     * Nếu tỷ lệ không giống target:
     * main.jsx sẽ chuyển ảnh sang edit.js
     * khi đây là tỷ lệ cực rộng/cực cao.
     */

    console.log("AI DESIGN PRINT GENERATED IMAGE:", {
      sourceWidth,
      sourceHeight,
      sourceAspectRatio,
      targetWidth: w,
      targetHeight: h,
      targetAspectRatio: aspectRatio,
      ratioDifference,
      layoutType,
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

      requiresAspectProcessing:
        layoutType === "ULTRA_WIDE" ||
        layoutType === "WIDE" ||
        layoutType === "ULTRA_TALL",

      ratioDifference,

      pipeline:
        "AI generation → aspect-ratio expansion → final artwork",
    });
  } catch (error) {
    console.error(
      "AI DESIGN PRINT GENERATE ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Không thể tạo thiết kế AI.",
    });
  }
}
```
