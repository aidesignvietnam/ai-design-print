import OpenAI from "openai";

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
      image,
      editPrompt,
    } = req.body;

    if (!image) {
      return res.status(400).json({
        error: "Không có ảnh gốc để chỉnh sửa.",
      });
    }

    if (!editPrompt || !editPrompt.trim()) {
      return res.status(400).json({
        error: "Vui lòng nhập yêu cầu chỉnh sửa.",
      });
    }

    const response = await openai.images.edit({
      model: "gpt-image-1",
      image: image,
      prompt: `
You are an image editing assistant for a professional advertising and printing design tool.

IMPORTANT EDITING RULES:

1. EDIT THE PROVIDED ORIGINAL IMAGE. Do not create an unrelated new design.
2. Preserve the original composition, layout, proportions, objects, and visual hierarchy unless the user explicitly asks to change them.
3. ONLY make the changes explicitly requested by the user.
4. Do NOT invent new text or replace existing text with different wording unless the user explicitly requests a text change.
5. If the user asks to change text, change ONLY the specified text and preserve the rest of the typography and layout as much as possible.
6. If the user asks to change a background color, change ONLY the background color.
7. Preserve all elements that the user did not ask to change.
8. Do not add logos, objects, decorations, people, or text that were not requested.
9. Do not redesign the entire image.
10. For printing designs, preserve clean edges, readable typography, and the original aspect ratio.

USER'S EDIT REQUEST:
${editPrompt.trim()}
      `,
    });

    const imageBase64 = response.data?.[0]?.b64_json;

    if (!imageBase64) {
      throw new Error("OpenAI không trả về ảnh chỉnh sửa.");
    }

    return res.status(200).json({
      image: `data:image/png;base64,${imageBase64}`,
    });

  } catch (error) {
    console.error("EDIT ERROR:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Không thể chỉnh sửa thiết kế.",
    });
  }
}
