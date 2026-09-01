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

    const designPrompt = `
Create a professional large-format advertising design.

Design type: ${designType}
Size: ${width} × ${height} ${unit}
Style: ${style}
User request: ${prompt || "Create an attractive professional design suitable for printing."}

Requirements:
- Professional commercial graphic design
- Suitable for large-format printing
- Strong visual hierarchy
- Clear composition
- Attractive typography
- Leave appropriate safe margins
- High visual quality
- Vietnamese advertising context
- Do not include watermarks
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
    });
  } catch (error) {
    console.error("OpenAI error:", error);

    return res.status(500).json({
      error: error?.message || "AI generation failed.",
    });
  }
}
