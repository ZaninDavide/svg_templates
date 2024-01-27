function download_svg(resolution = 4096){
    overlay.style.display = "block";
    var svg = document.getElementsByTagName("svg")[0];
    var data = svg.outerHTML;
    var DOMURL = window.URL || window.webkitURL || window;
  
    var img = new Image();
    var svgBlob = new Blob([data], {type: 'image/svg+xml;charset=utf-8'});
    var url = DOMURL.createObjectURL(svgBlob);
    
    // get the size of the svg image
    const width = svg.getBoundingClientRect().width;
    const height = svg.getBoundingClientRect().height;

    // create a canvas and set its size
    var canvas = document.createElement(`canvas`);
    var ctx = canvas.getContext('2d');
    var factor = resolution / Math.min(height, width) 
    canvas.setAttribute("width", width*factor);
    canvas.setAttribute("height", height*factor);
  
    img.onload = function () {
      ctx.drawImage(img, 0, 0, width*factor, height*factor);
      DOMURL.revokeObjectURL(url);
  
      var imgURI = canvas
          .toDataURL('image/png')
          .replace('image/png', 'image/octet-stream');
  
      triggerDownload(imgURI);
      overlay.style.display = "none";
    };
  
    img.src = url;
}

function triggerDownload (imgURI) {
  var evt = new MouseEvent('click', {
    view: window,
    bubbles: false,
    cancelable: true
  });

  var a = document.createElement('a');
  let file_name = prompt("File name:")
  a.setAttribute('download', file_name + '.png');
  a.setAttribute('href', imgURI);
  a.setAttribute('target', '_blank');

  a.dispatchEvent(evt);
}