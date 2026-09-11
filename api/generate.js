import OpenAI, { toFile } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// =====================================================
// HELPERS
// =====================================================

function getRatio(width, height) {
  if (!width || !height) {
    return 1;
  }

  return Number(width) / Number(height);
}

function classifyLayout(ratio) {
  if (ratio >= 2.5) {
    return "ultra-wide";
  }

  if (ratio >= 1.5) {
    return "landscape";
  }

  if (ratio <= 0.7) {
    return "ultra-tall";
  }

  if (ratio <= 0.9) {
    return "portrait";
  }

  return "square";
}

function getOutputSize(ratio) {
  /*
   * GPT Image hỗ trợ các kích thước chuẩn.
   * Với banner quá rộng/quá cao, ta tạo ảnh nền phù hợp
   * rồi frontend/backend sẽ xử lý mở rộng tiếp.
   */

  if (ratio >= 1.5) {
    return "1536x1024";
  }

  if (ratio <= 0.9) {
    return "1024x1536";
  }

  return "1024x1024";
}

function needsOutpaint(ratio) {
  return ratio >= 2.5 || ratio <= 0.7;
}

// =====================================================
// CONVERT DATA URL → FILE
// =====================================================

async function dataUrlToFile(dataUrl) {
  if (
    typeof dataUrl !== "string" ||
    !dataUrl.startsWith("data:image/")
  ) {
    throw new Error(
      "Ảnh tham khảo không đúng định dạng."
    );
  }

  const match = dataUrl.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
  );

  if (!match) {
    throw new Error(
      "Không đọc được dữ liệu ảnh tham khảo."
    );
  }

  const mimeType = match[1];
  const base64Data = match[2];

  let extension = "png";

  if (mimeType === "image/jpeg") {
    extension = "jpg";
  } else if (mimeType === "image/webp") {
    extension = "webp";
  } else if (mimeType === "image/png") {
    extension = "png";
  }

  const buffer = Buffer.from(
    base64Data,
    "base64"
  );

  return toFile(
    buffer,
    "reference." + extension,
    {
      type: mimeType,
    }
  );
}

// =====================================================
// BUILD PROMPT
// =====================================================

function buildPrompt({
  designType,
  width,
  height,
  unit,
  prompt,
  style,
  designPlan,
  uploadedImage,
}) {
  const planText =
    designPlan &&
    typeof designPlan === "object"
      ? JSON.stringify(
          designPlan,
          null,
          2
        )
      : "";

  let finalPrompt = `
You are a professional advertising graphic designer
specialized in large-format printing, banners, backdrops,
signage, posters and commercial advertising.

Create a professional ${designType} design.

TARGET SIZE:
${width} × ${height} ${unit}

VISUAL STYLE:
${style}

CLIENT DESIGN BRIEF:
${prompt}

DESIGN PLAN:
${planText}

IMPORTANT DESIGN REQUIREMENTS:

1. Treat the requested dimensions as the final physical
   print proportion.

2. Use the entire visual canvas effectively.

3. Create a professional advertising composition,
   not a generic AI artwork.

4. Establish a clear hierarchy:
   - main headline
   - supporting information
   - visual subject
   - decorative elements
   - background

5. Keep important text and visual subjects large enough
   to be readable when printed.

6. Do not squeeze the design into a tiny area in the center.

7. Do not create unnecessary empty white borders.

8. Do not create a three-panel layout.

9. Do not duplicate people, products, logos or important
   objects.

10. Maintain strong visual balance from edge to edge.

11. Leave appropriate safe margins for printing.

12. Use professional typography and advertising composition.

13. The final artwork must look like a real professional
   advertising design prepared for print production.

14. If the client provides exact wording, preserve the
   wording and spelling as accurately as possible.

15. Do not add unrelated text.

16. Do not add fake phone numbers, fake addresses,
   fake logos or unrelated information.
`;

  if (uploadedImage) {
    finalPrompt += `

REFERENCE IMAGE:

A reference image has been supplied separately.

Use the reference image as an important visual reference.
Analyze its:
- composition
- visual hierarchy
- color direction
- subject placement
- typography style
- decorative elements
- overall advertising style

Create a new professional design based on the reference,
while following the client's new brief and requested
dimensions.

Do NOT simply display the reference image unchanged.

Preserve useful visual characteristics from the reference,
but adapt the composition intelligently to the requested
design.

If the reference contains a person, product, logo or major
visual element that should remain recognizable, preserve
its identity and overall appearance.

Do not randomly replace important elements.
`;
  }

  finalPrompt += `

FINAL OUTPUT:

Professional commercial advertising artwork suitable for
large-format printing.

Use the full canvas.
Strong composition.
Clear hierarchy.
Professional visual design.
No unnecessary borders.
No tiny centered composition.
`;

  return finalPrompt;
}

// =====================================================
// API HANDLER
// =====================================================

export default async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed.",
    });
  }

  try {
    const {
      designType,
      width,
      height,
      unit,
      prompt,
      style,
      aspectRatio,
      designPlan,
      uploadedImage,
    } = req.body || {};

    // ---------------------------------------------------
    // VALIDATION
    // ---------------------------------------------------

    const numericWidth =
      Number(width);

    const numericHeight =
      Number(height);

    if (
      !Number.isFinite(
        numericWidth
      ) ||
      !Number.isFinite(
        numericHeight
      ) ||
      numericWidth <= 0 ||
      numericHeight <= 0
    ) {
      return res.status(400).json({
        error:
          "Kích thước W × H không hợp lệ.",
      });
    }

    if (
      !prompt ||
      typeof prompt !== "string" ||
      !prompt.trim()
    ) {
      return res.status(400).json({
        error:
          "Vui lòng nhập nội dung thiết kế.",
      });
    }

    // ---------------------------------------------------
    // RATIO
    // ---------------------------------------------------

    const ratio =
      Number.isFinite(
        Number(aspectRatio)
      ) && Number(aspectRatio) > 0
        ? Number(aspectRatio)
        : getRatio(
            numericWidth,
            numericHeight
          );

    const layout =
      classifyLayout(ratio);

    const outputSize =
      getOutputSize(ratio);

    const expandRequired =
      needsOutpaint(ratio);

    // ---------------------------------------------------
    // PROMPT
    // ---------------------------------------------------

    const finalPrompt =
      buildPrompt({
        designType,
        width: numericWidth,
        height: numericHeight,
        unit,
        prompt,
        style,
        designPlan,
        uploadedImage:
          uploadedImage || null,
      });

    console.log(
      "AI DESIGN PRINT:",
      {
        designType,
        width: numericWidth,
        height: numericHeight,
        unit,
        ratio,
        layout,
        outputSize,
        hasReferenceImage:
          Boolean(uploadedImage),
      }
    );

    // ---------------------------------------------------
    // GENERATE IMAGE
    // ---------------------------------------------------

    let result;

    // ===================================================
    // CASE 1:
    // KHÔNG CÓ ẢNH THAM KHẢO
    // → images.generate()
    // ===================================================

    if (!uploadedImage) {
      console.log(
        "Generation mode: CREATE"
      );

      result =
        await openai.images.generate({
          model: "gpt-image-2",

          prompt: finalPrompt,

          size: outputSize,

          quality: "high",

          output_format: "png",
        });
    }

    // ===================================================
    // CASE 2:
    // CÓ ẢNH THAM KHẢO
    // → images.edit()
    // ===================================================

    else {
      console.log(
        "Generation mode: REFERENCE IMAGE EDIT"
      );

      const referenceFile =
        await dataUrlToFile(
          uploadedImage
        );

      result =
        await openai.images.edit({
          model: "gpt-image-2",

          image: referenceFile,

          prompt: finalPrompt,

          size: outputSize,

          quality: "high",

          output_format: "png",
        });
    }

    // ---------------------------------------------------
    // CHECK RESULT
    // ---------------------------------------------------

    if (
      !result ||
      !result.data ||
      !result.data[0]
    ) {
      throw new Error(
        "AI không trả về dữ liệu hình ảnh."
      );
    }

    const imageData =
      result.data[0];

    let imageBase64 =
      imageData.b64_json;

    if (!imageBase64) {
      throw new Error(
        "AI không trả về dữ liệu ảnh base64."
      );
    }

    const image =
      "data:image/png;base64," +
      imageBase64;

    // ---------------------------------------------------
    // RESPONSE
    // ---------------------------------------------------

    return res.status(200).json({
      image,

      width: numericWidth,

      height: numericHeight,

      unit,

      ratio,

      layout,

      outputSize,

      hasReferenceImage:
        Boolean(uploadedImage),

      needsOutpaint:
        expandRequired,

      promptVersion:
        "AI DESIGN PRINT V1.0 PRO",

      success: true,
    });
  } catch (error) {
    console.error(
      "GENERATE API ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Không thể tạo thiết kế.",
    });
  }
}
