import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { MediaGallery, MediaImport } from "../src/components/visor/media-gallery";
import { usePublicIdentity } from "../src/components/public-session";
import { useTelemetryStore } from "../src/lib/telemetry-store";
import { useMediaStore } from "../src/lib/media-store";
declare global {interface Window {
 mediaFixture:{apiURL:string;a:string;b:string};
 mediaAccount:(v:"a"|"b"|null)=>void;
 mediaSelect:(id:string)=>void;
 mediaGeneration:()=>number;
 mediaState:()=>ReturnType<typeof useMediaStore.getState>;
}}
window.mediaSelect=id=>useTelemetryStore.getState().select({mode:"public",apiURL:window.mediaFixture.apiURL,deviceId:id,deviceName:"Fixture",offline:true});
window.mediaGeneration=()=>useTelemetryStore.getState().generation;
window.mediaState=()=>useMediaStore.getState();
function Fixture(){
 const [account,setAccount]=useState<"a"|"b"|null>("a");
 useEffect(()=>{window.mediaAccount=setAccount},[]);
 usePublicIdentity(account,async()=>account?window.mediaFixture[account]:null);
 return <main><div style={{display:"flex",height:"210px",width:"600px"}}><MediaGallery/></div><MediaImport/></main>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
