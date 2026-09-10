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

    // Tính tỷ lệ thật của thiết kế
    const aspectRatio = w / h;

    // Chuyển tỷ lệ thành hướng bố cục
    let layoutInstruction = "";

    if (aspectRatio >= 4) {
      layoutInstruction = `
EXTREMELY WIDE HORIZONTAL BANNER.

The requested physical design ratio is approximately ${aspectRatio.toFixed(2)}:1.

Create the artwork as an extremely wide panoramic advertising banner.

The composition must extend strongly from LEFT to RIGHT.

Do NOT create a square image.
Do NOT create a normal landscape poster.
Do NOT concentrate the design in the center.
Do NOT create a 3:2 composition.

Spread the visual elements across the entire horizontal space.

Place important text and visual subjects across the long horizontal canvas.

The final composition should visually resemble a real ${w} × ${h} ${unit} advertising banner.
`;
    } else if (aspectRatio >= 2) {
      layoutInstruction = `
WIDE HORIZONTAL ADVERTISING FORMAT.

Physical ratio: approximately ${aspectRatio.toFixed(2)}:1.

Use a wide panoramic landscape composition.

Use the entire horizontal space.

Avoid square and portrait layouts.
`;
    } else if (aspectRatio > 1.15) {
      layoutInstruction = `
LANDSCAPE ADVERTISING FORMAT.

Physical ratio: approximately ${aspectRatio.toFixed(2)}:1.

Create a horizontal composition.
`;
    } else if (aspectRatio <= 0.25) {
      layoutInstruction = `
EXTREMELY TALL VERTICAL ADVERTISING FORMAT.

Physical ratio: approximately ${aspectRatio.toFixed(2)}:1.

Create a very tall vertical advertising composition.

Do NOT create a square image.
Do NOT create a landscape image.

Use the full vertical space.
`;
    } else if (aspectRatio <= 0.55) {
      layoutInstruction = `
TALL VERTICAL ADVERTISING FORMAT.

Physical ratio: approximately ${aspectRatio.toFixed(2)}:1.

Create a vertical advertising composition.

Use the full vertical space.
`;
    } else if (aspectRatio < 0.87) {
      layoutInstruction = `
PORTRAIT ADVERTISING FORMAT.

Physical ratio: approximately ${aspectRatio.toFixed(2)}:1.

Create a vertical composition.
`;
    } else {
      layoutInstruction = `
NEAR-SQUARE ADVERTISING FORMAT.

Physical ratio: approximately ${aspectRatio.toFixed(2)}:1.

Create a balanced composition using the entire canvas.
`;
    }

    const designPrompt = `
You are a professional advertising graphic designer.

CREATE A PRINT-READY ADVERTISING DESIGN.

DESIGN TYPE:
${designType}

PHYSICAL SIZE:
${w} × ${h} ${unit}

EXACT ASPECT RATIO:
${aspectRatio.toFixed(4)} : 1

LAYOUT INSTRUCTION:
${layoutInstruction}

VISUAL STYLE:
${style}

USER REQUEST:
${prompt || "Create an attractive professional advertising design suitable for printing."}

DESIGN REQUIREMENTS:

1. The physical W × H dimensions are extremely important.
2. The composition must visually respect the requested aspect ratio.
3. Do not use a generic square composition.
4. Do not use a generic 3:2 composition.
5. Do not crop important text or subjects.
6. Use the entire available canvas.
7. Keep important content inside safe margins.
8. Create strong professional visual hierarchy.
9. Make typography large and readable.
10. Use professional commercial advertising design principles.
11. Suitable for Vietnamese advertising and large-format printing.
12. No watermark.
13. No unnecessary borders.
14. The design should look like a real professional print advertising layout.
`;

    /*
     * GPT Image supports a limited set of native output sizes.
     * We select the closest orientation to the requested physical ratio.
     */

    let outputSize = "1536x1024";

    if (aspectRatio < 0.87) {
      outputSize = "1024x1536";
    } else if (aspectRatio >= 1.15) {
      outputSize = "1536x1024";
    } else {
      outputSize = "1024x1024";
    }

    const result = await client.images.generate({
      model: "gpt-image-2",
      prompt: designPrompt,
      size: outputSize,
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
      outputSize,
    });
  } catch (error) {
    console.error("OpenAI error:", error);

    return res.status(500).json({
      error: error?.message || "AI generation failed.",
    });
  }
}
