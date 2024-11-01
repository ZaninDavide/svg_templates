const viewport = document.getElementById("viewport")
const fields_container = document.getElementById("fields")
const templates_container = document.getElementById("templates")
const input_template = document.getElementById("input_template")
const input_template_button = document.getElementById("input_template_button")
const overlay = document.getElementById("overlay")
const editor_page = document.getElementById("editor_page")
const template_page = document.getElementById("template_page")
const gallery_page = document.getElementById("gallery_page")
const gallery_image_name = document.getElementById("gallery_image_name")
const gallery_query = document.getElementById("gallery_query")
const gallery_query_form = document.getElementById("gallery_query_form")
const zoom_actual_size = document.getElementById("zoom_actual_size")
const zoom_fullscreen = document.getElementById("zoom_fullscreen")

// ROOT
const ROOT = "https://template.baida.dev";
const SERVER = "https://template.baida.dev:3009";

// IMAGE GALLERY SETUP
gallery_query_form.addEventListener("submit", gallery_search);
let gallery_image = {element_id: "", resize_type: ""};

// FIELDS
let field_groups = [];

// READ USER ID TOKEN
let id_token = "";
const url = new URL(window.location.href);
const params = new URLSearchParams(url.search);
const google_id_token = params.get('google_id_token');
if(google_id_token) {
    id_token = "GoogleIdToken " + google_id_token;
}else{
    window.location.replace(ROOT); // Login Page
}

// RETRIVE LIST OF USER TEMPLATES
let templates = []; // [ {svgid, title}, {svgid, title}, ... ]

function retrive_templates_list(callback) {
    fetch(SERVER + "/user/templates", {
        method: "GET",
        headers: { "Authorization": id_token },
    }).then(async (res) => {
        const json = await res.json();
        if(json) {
            templates = json.map(row => row.templates)
            if(callback) callback(templates)
        }
    }).catch(err => {
        console.error("Error fetching templates: " + err.message);
    });
}
retrive_templates_list(list_stored_templates)

function list_stored_templates() {
    templates_container.innerHTML = "";
    templates.forEach(template => {
        let template_button_container = document.createElement("div");
        template_button_container.classList.add("template_button_container");
        // template_button_container.style.backgroundImage = 'linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)),url("data:image/svg+xml,' + encodeURIComponent(localStorage.getItem(template_name)) + '"';
        
        let template_button = document.createElement("button");
        template_button.innerText = template.title;
        template_button.title = template.title;
        template_button.classList.add("template_button");
        template_button.onclick = () => {
            editor_page.style.display = "none";
            template_page.style.display = "none";
            gallery_page.style.display = "none";
            download_template(template.svgid).then(svg => {
                viewport.innerHTML = svg;
                find_fields(svg);
                editor_page.style.display = "";
                zoom("actual_size");
            }).catch(err => {
                console.error(err);
            })
        }
        template_button_container.appendChild(template_button);

        let remove_template_button = document.createElement("button");
        remove_template_button.classList.add("material-symbols-outlined");
        remove_template_button.classList.add("template_delete_button");
        remove_template_button.innerText = "delete";
        remove_template_button.onclick = () => {
            if(confirm("Should I remove '" + template.title + "'?")) {
                delete_template(template.svgid, () => retrive_templates_list(list_stored_templates))
            } 
        };
        template_button_container.appendChild(remove_template_button);

        templates_container.appendChild(template_button_container);
    })
}

function load_template(){
    input_template.click()
}

function upload_template(title, svg) {
    svg = encodeURIComponent(svg);
    const textEncoder = new TextEncoder();
    if(textEncoder.encode(svg).length > 2*1024*1024) {
        console.warn("Template to large to upload: " + err.message);
        return;
    }
    fetch(SERVER + "/user/upload_template/", {
        method: "POST",
        headers: { 
            "Authorization": id_token, 
            "Content-Type": "application/json" 
        },
        body: JSON.stringify({ title, svg })
    }).catch(err => {
        console.error("Error uploading template: " + err.message);
    }).then(_ => {
        retrive_templates_list()
    });
}

function download_template(svgid) {
    return new Promise((resolve, reject) => {
        fetch(SERVER + "/user/get_template/", {
            method: "POST",
            headers: { 
                "Authorization": id_token, 
                "Content-Type": "application/json" 
            },
            body: JSON.stringify({ svgid })
        }).then(async (res) => {
            let encoded_svg = await res.text();
            let unescaped_svg = decodeURIComponent(encoded_svg);
            resolve(unescaped_svg)
        }).catch(err => {
            reject("Error downloading template: " + err.message);
        });
    })
}

function delete_template(svgid, callback) {
    fetch(SERVER + "/user/delete_template/", {
        method: "POST",
        headers: { 
            "Authorization": id_token, 
            "Content-Type": "application/json" 
        },
        body: JSON.stringify({ svgid })
    }).then(async (res) => {
        callback()
    }).catch(err => {
        console.error("Error deleting template: " + err.message + ".");
    });
}

function read_template(event){
    var input = event.target;
    var reader = new FileReader();
    reader.onload = function(){
        const svg = reader.result;

        // read and open template 
        viewport.innerHTML = svg
        editor_page.style.display = "";
        template_page.style.display = "none";
        gallery_page.style.display = "none";

        // store template
        let name = input.files[0].name;
        name = name.split(".")[0] || name;
        upload_template(name, svg);
        find_fields(svg);
    };
    reader.readAsText(input.files[0]);
}

// find objects with fields and create widgets for them
function find_fields(svg){
    const tree = (new DOMParser()).parseFromString(svg, "application/xml");
    let new_field_groups = []
    let recursive = (obj) => {
        // if this has editable fields add them to the list
        if(obj.attributes && obj.attributes.fields){
            const str_fields = obj.attributes.fields.value
            const obj_id = obj.attributes.id.value
            let cur_fields = []
            str_fields.split(/\s*;\s*/).forEach(f => {
                const splitted = split_first_level(f, ":")
                if(splitted.length >= 2) {
                    cur_fields.push({
                        name: splitted[0].trim(),
                        type: splitted[1].trim()
                    })
                }
            })
            // on_refresh will contain functions that need to be executed to refresh the object
            // the key will refer to the field that requested that procedure
            new_field_groups.push({name: obj_id, fields: cur_fields, on_refresh: {}})
        }
        // do the same with his children
        if(obj.children){
            Object.values(obj.children).forEach(recursive)
        }
    }
    recursive(tree)
    add_fields(new_field_groups)
}

// create fields' editors widgets
function add_fields(new_field_groups){
    fields_container.innerHTML = ""
    new_field_groups.forEach((group, group_id) => {
        let group_label = document.createElement("h2");
        group_label.innerText = group.name
        fields_container.appendChild(group_label)
        group.fields.forEach(field => {
            // The special field names are: image, content; the meaning of field.type here is special.
            // Every other field is interpreted as (field.name, field.type) = (field_name, data_type).
            if(field.name === "image") {
                // SPECIAL FIELD: IMAGE
                // field type: keep-width / keep-height / keep-size / cover
                fields_container.appendChild( get_image_loader(group.name, field.type) )
            } else if(
                field.name === "content" 
                && !(field.type.startsWith("[") && field.type.endsWith("]"))
                && !(field.type.startsWith("{") && field.type.endsWith("}"))
            ) {
                // SPECIAL FIELD: CONTENT
                let types = field.type.split(" ");
                if(types.indexOf("text-multiline") !== -1){
                    // MULTILINE TEXT EDITOR
                    let editor = document.createElement("textarea")
                    editor.value = get_attr(group.name, field.name, field.type)
                    editor.placeholder = editor.value
                    editor.title = field.name;
                    editor.style.height = "200px"
                    if ( types.indexOf("align-center") !== -1 ) {
                        const element = document.getElementById(group.name)
                        // we save the original center position to avoid errors accumulating
                        const bounding_box = element.getBBox(); 
                        const centerY = bounding_box.y + 0.5*bounding_box.height;
                        element.setAttribute("originalCenterY", centerY)
                        editor.oninput = (e) => {
                            edit_multiline_text_align_center(group.name, e.target.value)
                            refresh_but(group.name, field.name)
                        }
                        // add a refresh schedule for the content field this is needed because 
                        // the line spacing depends on fontFamily, fontSize, lineHeight,... 
                        new_field_groups[group_id].on_refresh[field.name] = () => 
                            edit_multiline_text_align_center(group.name, editor.value);
                    } else {
                        editor.oninput = (e) => {
                            edit_multiline_text(group.name, e.target.value)
                            refresh_but(group.name, field.name)
                        }
                        // add a refresh schedule for the content field this is needed because 
                        // the line spacing depends on fontFamily, fontSize, lineHeight,... 
                        new_field_groups[group_id].on_refresh[field.name] = () => 
                            edit_multiline_text(group.name, editor.value);
                    }
                    // running this once at the begging is needed because other editors may 
                    // work only after the multiline text has been built once
                    editor.oninput({target: {value: editor.value}});
                    fields_container.appendChild(editor)
                }else if(types.indexOf("text") !== -1){
                    // TEXT EDITOR
                    let editor = document.createElement("input")
                    editor.type = "text"
                    editor.value = get_attr(group.name, field.name, field.type)
                    editor.title = field.name;
                    if(editor.type === "text") editor.placeholder = editor.value
                    editor.oninput = (e) => {
                        edit_text(group.name, e.target.value)
                        refresh_but(group.name, field.name)
                    }
                    fields_container.appendChild(editor)
                }
            } else {
                // ORDINARY FIELD: (field.name, field.type) = (object property name, property data type)
                if (field.type === "color") {
                    // COLOR PICKER
                    const value = get_attr(group.name, field.name, field.type)
                    let color_picker_box = document.createElement("div")
                    color_picker_box.className = "color_picker_box"
                    color_picker_box.style.backgroundColor = value
                    let color_picker = document.createElement("input")
                    color_picker.type = "color"
                    color_picker.value = value
                    color_picker.style.opacity = 0
                    color_picker.onchange = (e) => {
                        color_picker_box.style.backgroundColor = e.target.value
                        edit_attr(group.name, field.name, e.target.value)
                        refresh_but(group.name, field.name)
                    }
                    color_picker_box.appendChild(color_picker)
                    color_picker_box.title = field.name;
                    fields_container.appendChild(color_picker_box)
                } else if(field.type.startsWith("[") && field.type.endsWith("]")) {
                    // TOGGLE BETWEEN OPTIONS
                    // fontSize: [28px, 20px, 35px, 40px, 50px, 60px]; 
                    let options = field.type.slice(1,-1).split(",").map(op => op.trim()).filter(op => op !== "");
                    let editor = document.createElement("select");
                    options.forEach(op => {
                        let option = document.createElement("option");
                        option.value = op;
                        option.innerText = op;
                        editor.appendChild(option);
                    })
                    editor.title = field.name;
                    editor.onchange = (e) => {
                        edit_attr(group.name, field.name, e.target.value)
                        refresh_but(group.name, field.name)
                    }
                    fields_container.appendChild(editor)
                } else if(field.type.startsWith("{") && field.type.endsWith("}")) {
                    // TOGGLE BETWEEN NAMED OPTIONS
                    // fill: {nero: black, rosso: red, verde: green, blu: blue}; 
                    let options = field.type
                        .slice(1,-1)
                        .split(",")
                        .map(op => op.trim())
                        .filter(op => op !== "")
                        .map(op => {
                            const x = op.split(":");
                            return { label: x[0].trim(), value: x[1].trim() }
                        })
                    ;
                    let editor = document.createElement("select");
                    options.forEach(op => {
                        let option = document.createElement("option");
                        option.value = op.value;
                        option.innerText = op.label;
                        editor.appendChild(option);
                    })
                    editor.title = field.name;
                    editor.onchange = (e) => {
                        edit_attr(group.name, field.name, e.target.value)
                        refresh_but(group.name, field.name)
                    }
                    fields_container.appendChild(editor)
                } else {
                    // GENERIC EDITOR
                    let editor = document.createElement("input")
                    editor.type = {
                        "text": "text",
                        "size": "text",
                        "number": "number",
                    }[field.type];
                    if (editor.type === undefined) {
                        console.error(`Unknown editor type '${field.type}'. The default text editor will be used.`);
                        editor.type = "text";
                    }
                    editor.value = get_attr(group.name, field.name, field.type)
                    editor.placeholder = field.name + ": " + editor.value
                    editor.title = field.name;
                    if (editor.type === "number") editor.step = 0.1;
                    editor.oninput = (e) => {
                        edit_attr(group.name, field.name, e.target.value)
                        refresh_but(group.name, field.name)
                    }
                    fields_container.appendChild(editor)
                }
            }

        })
    }) 

    // extra space for scrolling
    let space = document.createElement("div")
    space.style.height = "100px";
    fields_container.appendChild(space)

    // save this field groups in a global variable for later use
    // now each group contains a list of functions to run when
    // refreshing / updating the element
    field_groups = new_field_groups;
}

function get_attr(element_id, attr, attr_type){
    const element = document.getElementById(element_id)

    if(attr === "content"){
        let attr_types = attr_type.split(" ");
        if(attr_types.indexOf("text-multiline") !== -1){
            let str = element.innerHTML.replace(/<tspan[^>]*>([^<]*)<\/tspan>/g, `$1\n`)
            str = str.slice(0, str.length - 1)
            return str
        }else{
            return element.innerHTML
        }
    }else{
        return element.style[attr]
    }
}

function edit_text(element_id, value) {
    const element = document.getElementById(element_id)
    element.innerHTML = value.toString()
}

function edit_multiline_text(element_id, value) {
    const element = document.getElementById(element_id)
    const x = element.getAttribute("x")
    const y = element.getAttribute("y")
    const unit = element.style.fontSize.slice(element.style.fontSize.length - 2, element.style.fontSize.length)
    const fontSize = parseFloat(element.style.fontSize.slice(0, element.style.fontSize.length - 2))
    const spacing = fontSize * element.style.lineHeight

    element.innerHTML = value.split(/\n\r|\n|\r|\r\n/).map((line, i) => {
        return `<tspan x="${x}" y="${y}" dx="0" dy="${spacing*i}${unit}">${parseMarkdown(line)}</tspan>`
    }).join("")
}

function edit_multiline_text_align_center(element_id, value) {
    const element = document.getElementById(element_id)
    const unit = element.style.fontSize.slice(element.style.fontSize.length - 2, element.style.fontSize.length)
    const fontSize = parseFloat(element.style.fontSize.slice(0, element.style.fontSize.length - 2))
    const spacing = fontSize * parseFloat(element.style.lineHeight)
    const x = parseFloat(element.getAttribute("x"))
    const y = parseFloat(element.getAttribute("y"))
    const originalCenterY = parseFloat(element.getAttribute("originalCenterY"))

    let lines = value.split(/\n\r|\n|\r|\r\n/);
    lines = lines.map(l => parseMarkdown(l));

    // we write the text without considering center alignment
    element.innerHTML = lines.map((line, i) => {
        let dy = spacing*i;
        return `<tspan x="${x}" y="${y}" dx="0" dy="${dy}${unit}">${line}</tspan>`
    }).join("")

    // we calculate the new size and center of the text and compensate for the change
    const bounding_box = element.getBBox();
    const newCenterY = bounding_box.y + 0.5*bounding_box.height;
    const vertical_shift = newCenterY - originalCenterY;
    element.innerHTML = lines.map((line, i) => {
        let dy = spacing*i - vertical_shift;
        return `<tspan x="${x}" y="${y}" dx="0" dy="${dy}${unit}">${line}</tspan>`
    }).join("")
}

// edit_attr: set attribute of a given DOM element
function edit_attr(element_id, attr, value){
    const element = document.getElementById(element_id)
    if(attr === "content") {
        element.innerHTML = value;
    } else {
        element.style[attr] = value
    }
}

function set_image(image_element_id, image_dataurl, resize_type) {
    const image = document.getElementById(image_element_id)
    image.setAttribute("xlink:href", image_dataurl)

    const img = new Image()
    img.onload = () => {
        const resize_settings = resize_type.split(/\s+/)
        const image_width = image.getAttribute("original_width") || image.getAttribute("width")
        const image_height = image.getAttribute("original_height") || image.getAttribute("height")
        const image_centerX = parseFloat(image.getAttribute("x")) + parseFloat(image.getAttribute("width"))/2
        const image_centerY = parseFloat(image.getAttribute("y")) + parseFloat(image.getAttribute("height"))/2

        image.setAttribute("original_width", image_width)
        image.setAttribute("original_height", image_height)

        // const image_ratio = image_height / image_width
        const new_ratio = img.height / img.width
        const ratio = image_height / image_width
        let new_width = image_width
        let new_height = image_height
        if(resize_settings.indexOf("keep-width") !== -1){
            // resize height accordingly
            new_height = new_ratio * image_width
        }else if(resize_settings.indexOf("keep-height") !== -1){
            // resize width accordingly
            new_width = image_height / new_ratio
        }else if(resize_settings.indexOf("cover") !== -1){
            // use the largest of keep-height and keep-width
            let keep_width_scale_factor = (new_ratio * image_width) / image_height;
            let keep_height_scale_factor = (image_height / new_ratio) / image_width;
            if(keep_height_scale_factor > keep_width_scale_factor) {
                new_width = image_height / new_ratio
            }else{
                new_height = new_ratio * image_width
            }
        }else if(resize_settings.indexOf("fit") !== -1){
            if(new_ratio > ratio) {
                new_height = image_height;
                new_width = image_height / new_ratio;
            }else{
                new_width = image_width;
                new_height = image_width * new_ratio;
            }
        }else if(resize_settings.indexOf("keep-size") !== -1){
            // nothing to do
        }

        if(resize_settings.indexOf("align-center") !== -1){
            image.setAttribute("x", image_centerX - new_width/2 )
            image.setAttribute("y", image_centerY - new_height/2 )
        }

        image.setAttribute("height", new_height)
        image.setAttribute("width", new_width)

    }
    img.src = image_dataurl
}


function image_url_to_dataurl(url, callback) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let base_image = new Image();
    base_image.onload = function() {
        canvas.width = base_image.width;
        canvas.height = base_image.height;
        ctx.drawImage(base_image, 0, 0);
        callback(canvas.toDataURL());
        canvas.remove();
    }
    base_image.setAttribute("crossorigin", "anonymous");
    base_image.src = url;
}

function set_image_from_url(image_element_id, image_url, resize_type) {
    image_url_to_dataurl(image_url, dataurl => {
        set_image(image_element_id, dataurl, resize_type)
    })
}

function get_image_loader(element_id, resize_type){
    let input_file = document.createElement("input")
    input_file.type = "file"
    input_file.style.display = "none"
    input_file.accept = ".jpg,.jpeg,.png,.svg"
    input_file.onchange = event => {
        var file = event.target.files[0];
        var reader  = new FileReader();
        // it's onload event and you forgot (parameters)
        reader.onload = function(e)  {
            // the result image data
            const data_url = e.target.result;
            set_image(element_id, data_url, resize_type);
        }
        // you have to declare the file loading
        reader.readAsDataURL(file);
    }

    let input_file_button = document.createElement("button")
    input_file_button.classList.add("input_file_button")
    input_file_button.style.containerType = "inline-size"
    input_file_button.innerText = "IMAGE"
    input_file_button.innerHTML = `
        <span class="material-symbols-outlined" style="position: relative; top: 7px;line-height: 0px;">upload</span>
        <span class="hide_when_small">IMAGE</span>
    `
    input_file_button.title = "Load image from file"
    input_file_button.onclick = () => input_file.click()

    let input_url_button = document.createElement("button")
    input_url_button.classList.add("input_url_button")
    input_url_button.classList.add("material-symbols-outlined")
    input_url_button.innerText = "link"
    input_url_button.title = "Load image via link"
    input_url_button.onclick = () => {
        let url = prompt("Insert the link to the image you want to load.");
        set_image_from_url(element_id, url, resize_type);
    }

    let input_gallery_button = document.createElement("button")
    input_gallery_button.classList.add("input_gallery_button")
    input_gallery_button.classList.add("material-symbols-outlined")
    input_gallery_button.innerText = "search"
    input_gallery_button.title = "Find image in the gallery"
    input_gallery_button.onclick = () => { 
        editor_page.style.display = "none";
        template_page.style.display = "none";
        gallery_page.style.display = "";
        gallery_image = {element_id, resize_type};
        gallery_image_name.innerText = element_id;
        gallery_query.focus();
    }

    let input_file_box = document.createElement("div")
    input_file_box.classList.add("input_image_box")
    input_file_box.appendChild(input_file)
    input_file_box.appendChild(input_file_button)
    input_file_box.appendChild(input_gallery_button)
    input_file_box.appendChild(input_url_button)

    return input_file_box
}

list_stored_templates()

function split_first_level(string, char) {
    if(char.length !== 1) {
        console.error("split_first_level: char must be of length one");
        return [ string ];
    }
    let parts = [];
    let rn_level = 0; // round parenthesis
    let sq_level = 0; // square brackets
    let br_level = 0; // curly braces
    let from = 0;
    string += char;
    for(i = 0; i < string.length; i++) {
        if ( string[i] === char ) {
            if (rn_level === 0 && sq_level === 0 && br_level === 0) {
                parts.push(string.slice(from, i))
                from = i + 1;
            }
        }
        else if ( string[i] === "(" ){ rn_level += 1; }
        else if ( string[i] === ")"){ rn_level = Math.max(rn_level - 1, 0); }
        else if ( string[i] === "["){ sq_level += 1; }
        else if ( string[i] === "]"){ sq_level = Math.max(sq_level - 1, 0); }
        else if ( string[i] === "{"){ br_level += 1; }
        else if ( string[i] === "}"){ br_level = Math.max(br_level - 1, 0); }
    }
    return parts;
}

function refresh_but(group_name, but_field) {
    const f = field_groups.filter(g => g.name === group_name);
    if (f.length === 1) {
        const group = f[0]
        const fields_to_update = Object.keys(group.on_refresh).filter(k => k !== but_field);
        fields_to_update.forEach(f => { group.on_refresh[f](); })
    }
}

function parseMarkdown(line) {
    return line
    .replace(/\*(.*)\*/gim, '<tspan style="font-weight: bold;">$1</tspan>') // bold text
    .replace(/_(.*)_/gim, '<tspan style="font-style: italic;">$1</tspan>'); // italic text
}

function gallery_search(e) {
    e.preventDefault();
    const query = encodeURIComponent(gallery_query.value);
    const API_KEY = "bruM5nwNzwOjkmBt5mhEKwoKT1AW8LoFxtAi7SCLvj1cPWYePFLjc8OO";
    gallery_container.innerHTML = "";
    fetch('https://api.pexels.com/v1/search?query=' + query, {
        headers: {
            'Authorization': API_KEY
        }
    }).then(response=>response.json()).then(data=>{ 
        data.photos.forEach(photo => {
            gallery_container.innerHTML += `
                <img onclick="set_image_from_url('${gallery_image.element_id}', '${photo.src.large2x}', '${gallery_image.resize_type}');" alt="${photo.alt}" title="${photo.alt}" src="${photo.src.large}" class="gallery_image"/><br/>
                <div style="margin-left: 10px; margin-bottom: 30px"><a href="${photo.photographer_url}" target="_blank" style="color: black">${photo.photographer}</a></div>
                <div style="margin-right: 20px; margin-top: -50px; text-align: right;"><a href="${photo.url}" target="_blank" style="color: black">View in context</a></div>
                <br/>
            `;
        })
    })
}

function back_to_home() {
    editor_page.style.display = 'none';
    gallery_page.style.display = 'none';
    template_page.style.display = '';
    viewport.innerHTML = "";
    fields_container.innerHTML = "";
    gallery_image = {element_id: "", resize_type: ""};
    field_groups = [];
    list_stored_templates()
}

function zoom(zoom_type) {
    let svg = viewport.children.item(0);
    if(zoom_type == "actual_size"){
        zoom_actual_size.classList.add("chosen");
        zoom_fullscreen.classList.remove("chosen");
        if(svg.getAttribute("actual_width") && svg.getAttribute("actual_height")) {
            svg.setAttribute("width", svg.getAttribute("actual_width"));
            svg.setAttribute("height", svg.getAttribute("actual_height"));
            svg.setAttribute("actual_width", "");
            svg.setAttribute("actual_height", "");
            svg.setAttribute("preserveAspectRatio", undefined);
        }
        viewport.style.overflow = "auto";
    }else if(zoom_type == "fullscreen"){
        zoom_actual_size.classList.remove("chosen");
        zoom_fullscreen.classList.add("chosen");
        if(!svg.getAttribute("actual_width") && !svg.getAttribute("actual_height")) {
            svg.setAttribute("actual_width", svg.getAttribute("width"));
            svg.setAttribute("actual_height", svg.getAttribute("height"));
            svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
            svg.setAttribute("width", "100%");
            svg.setAttribute("height", "100%");
        }
        viewport.style.overflow = "hidden";
    }
}