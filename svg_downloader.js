let saveSvgAsPng;
import("https://cdn.skypack.dev/save-svg-as-png@1.4.17").then(res => {saveSvgAsPng = res});

function download_svg(){
    if(!saveSvgAsPng) return
    let svg = document.getElementsByTagName("svg")[0]
    let file_name = prompt("File name:")
    saveSvgAsPng.saveSvgAsPng(svg, file_name, {scale: 4});
}