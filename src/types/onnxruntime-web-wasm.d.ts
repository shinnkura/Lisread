// onnxruntime-web の "./wasm" サブパスには型定義が付いていないため、本体の型を流用する
declare module 'onnxruntime-web/wasm' {
  import type * as ort from 'onnxruntime-common';
  export const env: typeof ort.env;
  export const InferenceSession: typeof ort.InferenceSession;
  export const Tensor: typeof ort.Tensor;
}
