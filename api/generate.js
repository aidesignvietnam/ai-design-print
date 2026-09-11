import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ------------------------------------------------------------
// AI DESIGN PRINT
// PANORAMA GENERATION ENGINE
// ------------------------------------------------------------

function getRatio(width, height) {
  const w = Number(width);
  const h = Number(height);

  if (!w || !h || w <= 0 || h <= 0) {
    return 1;
  }

  return w / h;
}

function classifyLayout(ratio) {
  if (ratio >= 5) return "PANORAMA_EXTREME";
  if (ratio >= 3) return "PANORAMA_WIDE";
  if (ratio >= 2.5) return "WIDE";

  if (ratio <= 0.2) return "VERTICAL_EXTREME";
  if (ratio <= 0.7) return "TALL";

  return "STANDARD";
}

// ------------------------------------------------------------
// GPT IMAGE SIZE
// ------------------------------------------------------------

function getOutputSize(ratio) {
  // GPT Image giới hạn tỷ lệ ảnh.
  // Panorama cực rộng sẽ dùng ảnh trung gian 3:1.
  if (ratio >= 3) {
    return "1536x512";
  }

  if (ratio <= 0.333333) {
    return "512x1536";
  }

  if (ratio >= 2) {
    return "1536x768";
  }

  if (ratio >= 1) {
    return "1536x1024";
  }

  return "1024x1536";
}

// ------------------------------------------------------------
// PANORAMA COMPOSITION
// ------------------------------------------------------------

function buildPanoramaInstruction(ratio, designType) {
  if (ratio >= 5) {
    return `
THIS IS AN EXTREME-WIDE PANORAMA ADVERTISING DESIGN.

The requested physical format is extremely wide:
approximately ${ratio.toFixed(2)}:1.

DO NOT compose this as a centered poster.

The composition MUST intentionally use the ENTIRE horizontal canvas.

Think of the design as one continuous wide advertising scene:

LEFT ZONE:
- decorative visual elements
- supporting imagery
- environmental details
- patterns, light, shapes or secondary objects
- enough visual interest to occupy the left side

CENTER ZONE:
- main advertising message
- main subject or product
- primary visual focus
- strongest typography hierarchy

RIGHT ZONE:
- complementary imagery
- decorative elements
- environmental details
- light effects, shapes, patterns or secondary objects
- enough visual interest to occupy the right side

IMPORTANT:
- The left, center and right areas must visually connect.
- They must look like ONE continuous advertising composition.
- Do NOT create three separate panels.
- Do NOT create a triptych.
- Do NOT put all important content in the center.
- Do NOT leave large empty areas on either side.
- Do NOT stretch people, products, logos or objects.
- Do NOT duplicate people, products, logos or major objects.
- Do NOT mirror the same object on both sides.
- Do NOT create artificial blank margins.
- Do NOT make the artwork look like a small poster placed inside a huge canvas.

The visual density should gradually flow from left to center to right.

The main subject may be slightly off-center when that creates a stronger panoramic composition.

Use:
- continuous background
- depth
- lighting
- decorative elements
- secondary imagery
- atmospheric details
- subtle gradients
- connected environmental elements

to naturally fill the full horizontal space.

The extreme left and extreme right edges should contain supporting visual information,
not empty background.

Keep all important text, logos and faces safely away from the extreme edges.

The result must look like a professionally designed large-format advertising backdrop/banner prepared for printing.
`;
  }

  if (ratio >= 3) {
    return `
Create a professional wide-format advertising composition.

Use the entire horizontal canvas.

Do not concentrate the design only in the center.

Distribute the composition naturally from left to center to right.

Use a strong central hierarchy while maintaining meaningful supporting visual elements on both sides.

Everything must belong to ONE continuous scene.

Do not create three panels.
Do not create a triptych.
Do not duplicate major objects.
Do not stretch people, products or logos.
Do not leave large empty areas at either side.

Keep important text and subjects inside safe margins.

The result should look like a professional large-format advertising banner/backdrop.
`;
  }

  if (ratio >= 2.5) {
    return `
Create a professional wide advertising design.

Use the complete horizontal canvas.

Balance the main message with supporting visual elements across the left, center and right areas.

Avoid placing everything in the center.

Maintain one continuous visual environment.

Do not create a triptych or separate panels.

Do not duplicate major subjects.

Keep text, logos and important objects inside safe margins.
`;
  }

  if (ratio <= 0.2) {
    return `
Create an extremely tall vertical advertising design.

Use the complete vertical canvas.

Distribute visual elements naturally from top to middle to bottom.

Do not compress the design into the center.

Do not stretch people, products or logos.

Keep important content inside safe margins.
`;
  }

  if (ratio <= 0.7) {
    return `
Create a professional vertical advertising composition.

Use the complete vertical canvas.

Balance the composition from top to middle to bottom.

Avoid concentrating all content in the center.

Maintain clear hierarchy and safe margins.
`;
  }

  return `
Create a professional advertising composition using the complete canvas.

Maintain strong hierarchy, balanced spacing and safe margins.

Do not stretch people, products, logos or important objects.
`;
}

// ------------------------------------------------------------
// PROMPT
// ------------------------------------------------------------

function buildPrompt({
  designType,
  width,
  height,
  unit,
  prompt,
  style,
  ratio,
  layout,
}) {
  const panoramaInstruction = buildPanoramaInstruction(
    ratio,
    designType
  );

  return `
You are a senior professional advertising designer specializing in
large-format printing, backdrops, banners, billboards and event graphics.

PROJECT:
AI DESIGN PRINT

DESIGN TYPE:
${designType}

REQUESTED PHYSICAL SIZE:
${width} × ${height} ${unit}

REQUESTED ASPECT RATIO:
${ratio.toFixed(3)}:1

LAYOUT CLASS:
${layout}

DESIGN STYLE:
${style || "Hiện đại"}

CLIENT CONTENT:
${prompt || "Create an attractive professional advertising design."}

${panoramaInstruction}

GENERAL DESIGN RULES:

1. The requested physical dimensions are extremely important.
2. Respect the intended aspect ratio.
3. Compose for large-format printing.
4. Keep typography highly readable.
5. Establish clear visual hierarchy.
6. Use professional spacing.
7. Keep important content away from edges.
8. Never distort human bodies, faces, products or logos.
9. Never duplicate people, products, logos or major objects.
10. Never create accidental mirrored objects.
11. Never create a three-panel/triptych composition.
12. Never place the entire design inside a small central area.
13. The background must visually support the entire canvas.
14. The composition must feel intentional from edge to edge.
15. Use professional advertising aesthetics rather than generic AI artwork.

FOR EXTREME-WIDE FORMATS:

The image must be designed as a PANORAMIC ADVERTISEMENT.

Imagine the final printed banner is physically stretched horizontally across
a large wall or advertising frame.

The left side, center and right side must all contain meaningful visual information.

The center should carry the strongest message,
while the sides should contain complementary graphics,
environment, decorative elements and supporting imagery.

The three areas must connect naturally into one continuous scene.

Do NOT simply place a normal poster in the middle and extend an empty background around it.

Do NOT intentionally leave large blank areas on the left or right.

Do NOT use a border around the composition.

Do NOT use a fake canvas or mockup.

Create ONLY the artwork itself.

FINAL QUALITY:

Professional commercial advertising design.
Clean composition.
Strong hierarchy.
Print-ready visual quality.
Natural proportions.
Balanced panoramic distribution.
`;
}

// ------------------------------------------------------------
// API HANDLER
// ------------------------------------------------------------

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
      aspectRatio,
    } = req.body || {};

    const w = Number(width);
    const h = Number(height);

    if (!w || !h || w <= 0 || h <= 0) {
      return res.status(400).json({
        error: "Kích thước không hợp lệ.",
      });
    }

    const ratio =
      Number(aspectRatio) > 0
        ? Number(aspectRatio)
        : getRatio(w, h);

    const layout = classifyLayout(ratio);
    const outputSize = getOutputSize(ratio);

    const finalPrompt = buildPrompt({
      designType,
      width: w,
      height: h,
      unit,
      prompt,
      style,
      ratio,
      layout,
    });

    console.log("========================================");
    console.log("AI DESIGN PRINT PANORAMA GENERATE");
    console.log("width:", w);
    console.log("height:", h);
    console.log("unit:", unit);
    console.log("ratio:", ratio);
    console.log("layout:", layout);
    console.log("outputSize:", outputSize);
    console.log("========================================");

    const result = await openai.images.generate({
      model: "gpt-image-2",
      prompt: finalPrompt,
      size: outputSize,
      quality: "high",
      output_format: "png",
    });

    const imageBase64 = result?.data?.[0]?.b64_json;

    if (!imageBase64) {
      throw new Error("AI không trả về hình ảnh.");
    }

    const image = `data:image/png;base64,${imageBase64}`;

    return res.status(200).json({
      image,
      width: w,
      height: h,
      unit,
      ratio,
      layout,
      outputSize,
      needsOutpaint: ratio >= 2.5 || ratio <= 0.7,
      promptVersion: "AI-DESIGN-PRINT-V4-PANORAMA-DISTRIBUTED",
    });
  } catch (error) {
    console.error("AI DESIGN PRINT GENERATE ERROR:");

    console.error(error);

    return res.status(500).json({
      error:
        error?.message ||
        "Không thể tạo thiết kế AI.",
    });
  }
}
