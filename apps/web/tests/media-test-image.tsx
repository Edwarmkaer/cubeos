// Only esbuild fixture replaces Next's runtime wrapper. Production gallery and
// authenticated REST/bytes remain real; Next runtime is covered separately.
import { createElement } from "react";
import type { ImgHTMLAttributes } from "react";
export default function TestImage({fill,unoptimized,...props}:ImgHTMLAttributes<HTMLImageElement>&{fill?:boolean;unoptimized?:boolean}){void unoptimized;return createElement("img",{...props,alt:props.alt??"",style:fill?{position:"absolute",inset:0,width:"100%",height:"100%"}:undefined});}
