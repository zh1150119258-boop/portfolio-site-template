import sharp from "sharp";

export async function comparePngBuffers(referenceBuffer, candidateBuffer, channelThreshold = 0.08) {
  const referenceImage = sharp(referenceBuffer).ensureAlpha();
  const candidateImage = sharp(candidateBuffer).ensureAlpha();
  const [referenceMetadata, candidateMetadata] = await Promise.all([referenceImage.metadata(), candidateImage.metadata()]);
  if (referenceMetadata.width !== candidateMetadata.width || referenceMetadata.height !== candidateMetadata.height) {
    throw new Error(`image dimensions differ (${referenceMetadata.width}x${referenceMetadata.height} vs ${candidateMetadata.width}x${candidateMetadata.height})`);
  }
  const width = referenceMetadata.width;
  const height = referenceMetadata.height;
  if (!width || !height) throw new Error("could not read image dimensions");
  const [reference, candidate] = await Promise.all([referenceImage.raw().toBuffer(), candidateImage.raw().toBuffer()]);
  const diff = Buffer.alloc(reference.length);
  const threshold = channelThreshold * 255;
  let changedPixels = 0;
  let absoluteDelta = 0;
  for (let index = 0; index < reference.length; index += 4) {
    const deltas = [
      Math.abs(reference[index] - candidate[index]),
      Math.abs(reference[index + 1] - candidate[index + 1]),
      Math.abs(reference[index + 2] - candidate[index + 2]),
    ];
    const maximumDelta = Math.max(...deltas);
    absoluteDelta += deltas[0] + deltas[1] + deltas[2];
    if (maximumDelta > threshold) {
      changedPixels += 1;
      diff[index] = 238;
      diff[index + 1] = 48;
      diff[index + 2] = 57;
      diff[index + 3] = 255;
    } else {
      const luma = Math.round(reference[index] * 0.299 + reference[index + 1] * 0.587 + reference[index + 2] * 0.114);
      diff[index] = luma;
      diff[index + 1] = luma;
      diff[index + 2] = luma;
      diff[index + 3] = 72;
    }
  }
  const totalPixels = width * height;
  return {
    changedPixels,
    changedRatio: changedPixels / totalPixels,
    diff,
    height,
    meanChannelDelta: absoluteDelta / totalPixels / 3 / 255,
    width,
  };
}

export function compareDomEvidence(reference, candidate) {
  const selectors = [];
  let maximumBoxDelta = 0;
  let missingSelectors = 0;
  let styleMismatches = 0;
  let textMismatches = 0;
  for (const id of new Set([...Object.keys(reference), ...Object.keys(candidate)])) {
    const left = reference[id];
    const right = candidate[id];
    if (!left?.exists || !right?.exists) {
      missingSelectors += 1;
      selectors.push({ id, missing: true, referenceExists: left?.exists ?? false, candidateExists: right?.exists ?? false });
      continue;
    }
    const boxDelta = Math.max(...["x", "y", "width", "height"].map((key) => Math.abs(left.box[key] - right.box[key])));
    const mismatchedStyles = Object.keys(left.styles).filter((key) => left.styles[key] !== right.styles[key]);
    const textMatches = left.text === right.text;
    maximumBoxDelta = Math.max(maximumBoxDelta, boxDelta);
    styleMismatches += mismatchedStyles.length;
    if (!textMatches) textMismatches += 1;
    selectors.push({ boxDelta, id, mismatchedStyles, missing: false, textMatches });
  }
  return { maximumBoxDelta, missingSelectors, selectors, styleMismatches, textMismatches };
}
