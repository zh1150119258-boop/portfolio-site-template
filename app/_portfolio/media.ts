// 媒体地址规则。视频全部放在 R2，经媒体子域（site.config.ts 的 mediaUrl）直接读取，不经过网站本身。
// 每条视频四个版本（路径固定，播放层级和缓存规则都依赖它们）：
//   原画  <媒体文件夹>/clip-NN.mp4
//   流畅  streams-balanced/<媒体文件夹>/clip-NN.mp4   （默认播放）
//   预览  previews/<媒体文件夹>/clip-NN.mp4          （列表里静音循环）
//   封面  posters/<媒体文件夹>/clip-NN.jpg           （经本站 /media/posters/ 读取）
import { SITE } from "../../site.config";

export type PlayerQuality = "smooth" | "original";
// 本地预览（pnpm dev）没有媒体子域，视频改从本站 /media/ 读本机模拟存储桶。
const MEDIA_BASE = (process.env.NEXT_PUBLIC_MEDIA_CDN_BASE_URL || (process.env.NODE_ENV === "production" ? SITE.mediaUrl : "/media")).replace(/\/$/, "");

/** R2 里的路径 → 完整网址。version 用来在替换同名文件后让浏览器重新下载（一般不用）。 */
export const mediaUrl = (path: string, version = "") => `${MEDIA_BASE}/${path.replace(/^\/+/, "")}${version ? `?v=${encodeURIComponent(version)}` : ""}`;

const n2 = (index: number) => `clip-${String(index + 1).padStart(2, "0")}`;

/** 按编号存放的作品组（后台上传的作品都是这种）。 */
export const makeArchiveGroup = (id: string, no: string, title: string, cn: string, year: string, count: number, mediaBase: string, posterBase: string) => ({
  id, no, title, cn, year,
  clips: Array.from({ length: count }, (_, index) => mediaUrl(`${mediaBase}/${n2(index)}.mp4`)),
  previews: Array.from({ length: count }, (_, index) => mediaUrl(`previews/${mediaBase}/${n2(index)}.mp4`)),
  streams: Array.from({ length: count }, (_, index) => mediaUrl(`streams-balanced/${mediaBase}/${n2(index)}.mp4`)),
  posters: Array.from({ length: count }, (_, index) => `${posterBase}/${n2(index)}.jpg`),
});

/** 按文件名存放的作品组（手动传到 R2 的旧素材用，可选）：social/originals/<文件夹>/<名>.mp4 等。 */
export const makeSocialGroup = (id: string, no: string, title: string, en: string, files: string[], version = "", mediaId = id) => ({
  id, no, title, cn: title, en, year: "", files,
  clips: files.map((file) => mediaUrl(`social/originals/${mediaId}/${file}.mp4`, version)),
  previews: files.map((file) => mediaUrl(`social/previews/${mediaId}/${file}.mp4`, version)),
  streams: files.map((file) => mediaUrl(`streams-balanced/social/${mediaId}/${file}.mp4`, version)),
  posters: files.map((file) => `/media/posters/social/${mediaId}/${file}.jpg`),
});
