import type { BinaryAsset } from '../../models/types';

/**
 * BinaryAsset（Uint8Array + mime）を Blob に変換する。
 * @types/node の Uint8Array<ArrayBufferLike> 定義と lib.dom の BlobPart（Uint8Array<ArrayBuffer> 前提）が
 * 噛み合わないため、bytes を ArrayBuffer とみなしてキャストする（実行時の値は変わらない）。
 */
export function toBlob(asset: BinaryAsset): Blob {
  return new Blob([asset.bytes as Uint8Array<ArrayBuffer>], { type: asset.mime });
}
