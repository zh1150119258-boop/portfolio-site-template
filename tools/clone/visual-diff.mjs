#!/usr/bin/env node

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const [referenceArg, candidateArg, outputArg, thresholdArg] = process.argv.slice(2).filter((argument) => argument !== "--");
if (!referenceArg || !candidateArg || !outputArg) {
  console.error("Usage: visual-diff <reference.png> <candidate.png> <output.png> [threshold=0.08]");
  process.exit(1);
}

const referencePath = resolve(referenceArg);
const candidatePath = resolve(candidateArg);
const outputPath = resolve(outputArg);
const threshold = Number(thresholdArg ?? 0.08);

if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
  console.error("Error: threshold must be between 0 and 1");
  process.exit(1);
}

const referenceImage = sharp(referencePath).ensureAlpha();
const candidateImage = sharp(candidatePath).ensureAlpha();
const [referenceMetadata, candidateMetadata] = await Promise.all([
  referenceImage.metadata(),
  candidateImage.metadata(),
]);

if (referenceMetadata.width !== candidateMetadata.width || referenceMetadata.height !== candidateMetadata.height) {
  console.error(`Error: image dimensions differ (${referenceMetadata.width}x${referenceMetadata.height} vs ${candidateMetadata.width}x${candidateMetadata.height})`);
  process.exit(1);
}

const width = referenceMetadata.width;
const height = referenceMetadata.height;
if (!width || !height) {
  console.error("Error: could not read image dimensions");
  process.exit(1);
}

const [reference, candidate] = await Promise.all([
  referenceImage.raw().toBuffer(),
  candidateImage.raw().toBuffer(),
]);
const diff = Buffer.alloc(reference.length);
let changedPixels = 0;
const channelThreshold = threshold * 255;

for (let index = 0; index < reference.length; index += 4) {
  const redDelta = Math.abs(reference[index] - candidate[index]);
  const greenDelta = Math.abs(reference[index + 1] - candidate[index + 1]);
  const blueDelta = Math.abs(reference[index + 2] - candidate[index + 2]);
  const changed = Math.max(redDelta, greenDelta, blueDelta) > channelThreshold;

  if (changed) {
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

mkdirSync(dirname(outputPath), { recursive: true });
await sharp(diff, { raw: { width, height, channels: 4 } }).png().toFile(outputPath);

const totalPixels = width * height;
console.log(JSON.stringify({
  reference: referencePath,
  candidate: candidatePath,
  output: outputPath,
  width,
  height,
  threshold,
  changedPixels,
  changedRatio: Number((changedPixels / totalPixels).toFixed(6)),
}, null, 2));
