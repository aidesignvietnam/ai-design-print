import OpenAI from "openai";

const client = new OpenAI({
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
      width = "300",
      height = "270",
      unit = "cm",
      prompt = "",
      style = "Hiện đại",
    } = req.body || {};

    const w = Number(width);
    const h = Number(height);

    if (!w || !h || w <= 0 || h <= 0) {
      return res.status(400).json({
        error: "Kích thước W × H không hợp lệ.",
      });
    }

    // Tính tỷ lệ thiết kế
    const aspectRatio = w / h;

    // Phân loại tỷ lệ để AI hiểu cách bố cục
    let layoutInstruction = "";

    if (aspectRatio >= 4) {
      layoutInstruction = `
EXTREME HORIZONTAL FORMAT.
This is a very wide advertising banner.
The composition MUST be designed as a long horizontal layout.
Do not create a square composition.
Do not create a portrait composition.
Spread the visual elements naturally across the entire horizontal canvas.
Keep important text and subjects horizontally balanced.
`;
    } else if (aspectRatio >= 2) {
      layoutInstruction = `
WIDE HORIZONTAL FORMAT.
Create a wide landscape advertising composition.
Use the full horizontal space.
Avoid square or portrait composition.
`;
    } else if (aspectRatio > 1.15) {
      layoutInstruction = `
LANDSCAPE FORMAT.
Create a horizontal advertising composition.
`;
    } else if (aspectRatio <= 0.25) {
      layoutInstruction = `
EXTREME VERTICAL FORMAT.
This is a very tall advertising design.
The composition MUST be vertically oriented.
Do not create a square or landscape composition.
`;
    } else if (aspectRatio <= 0.55) {
      layoutInstruction = `
TALL VERTICAL FORMAT.
Create a vertical advertising composition.
Use the full vertical space.
`;
    } else if (aspectRatio < 0.87) {
      layoutInstruction = `
PORTRAIT FORMAT.
Create a vertical advertising composition.
`;
    } else {
      layoutInstruction = `
NEAR-SQUARE FORMAT.
Create a balanced composition using the full canvas.
`;
    }

    const designPrompt = `
Create a professional large-format advertising design.

DESIGN TYPE:
${designType}

EXACT USER DIMENSIONS:
${w} × ${h} ${unit}

CALCULATED ASPECT RATIO:
${aspectRatio.toFixed(4)} : 1

VISUAL LAYOUT REQUIREMENT:
${layoutInstruction}

STYLE:
${style}

USER REQUEST:
${prompt || "Create an attractive professional design suitable for printing."}

IMPORTANT DESIGN RULES:
- Treat the supplied W × H ratio as the physical design ratio.
- The final composition must visually match this ratio.
- Do not force the design into a square layout.
- Do not use a generic 1:1 composition.
- Use the entire available canvas.
- Maintain strong visual hierarchy.
- Keep important text inside safe margins.
- Keep text large and readable for large-format printing.
- Use professional commercial graphic design principles.
- Create a clean, balanced advertising layout.
- Suitable for Vietnamese advertising and printing.
- No watermark.
- No unnecessary borders.
- Do not crop important subjects or text.
`;

    const result = await client.images.generate({
      model: "gpt-image-2",
      prompt: designPrompt,
      size: "1536x1024",
      quality: "medium",
    });

    const imageBase64 = result.data?.[0]?.b64_json;

    if (!imageBase64) {
      return res.status(500).json({
        error: "AI did not return an image.",
      });
    }

    return res.status(200).json({
      success: true,
      image: `data:image/png;base64,${imageBase64}`,
      width: w,
      height: h,
      unit,
      aspectRatio,
    });
  } catch (error) {
    console.error("OpenAI error:", error);

    return res.status(500).json({
      error: error?.message || "AI generation failed.",
    });
  }
}
