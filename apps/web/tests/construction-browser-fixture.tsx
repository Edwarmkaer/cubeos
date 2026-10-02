// Isolated test entrypoint: never exposed by Next or production migrations.
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { ConstructionView } from "../src/components/construction-view";
import { usePublicIdentity } from "../src/components/public-session";
import { useTelemetryStore } from "../src/lib/telemetry-store";
declare global { interface Window {
 constructionFixture: { apiURL:string; a:string; b:string };
 constructionAccount:(v:"a"|"b"|null)=>void;
 constructionSelect:(id:string)=>void;
 constructionGeneration:()=>number;
}}
window.constructionSelect=id=>useTelemetryStore.getState().select({mode:"public",apiURL:window.constructionFixture.apiURL,deviceId:id,deviceName:"Fixture CubeSat",offline:true});
window.constructionGeneration=()=>useTelemetryStore.getState().generation;
function Fixture(){
 const [account,setAccount]=useState<"a"|"b"|null>("a");
 useEffect(()=>{window.constructionAccount=setAccount},[]);
 usePublicIdentity(account,async()=>account ? window.constructionFixture[account] : null);
 return <main style={{height:"800px"}}><ConstructionView/></main>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
