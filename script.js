const viewport = document.getElementById("viewport")
const fields_container = document.getElementById("fields")
const templates_container = document.getElementById("templates")
const input_template = document.getElementById("input_template")
const input_template_button = document.getElementById("input_template_button")
const save_buttons_container = document.getElementById("save_buttons_container")
const overlay = document.getElementById("overlay")

function list_stored_templates() {
    templates_container.innerHTML = "";
    let list = Object.keys(localStorage);
    list.forEach(template_name => {
        let template_button_container = document.createElement("div");

        let remove_template_button = document.createElement("div");
        remove_template_button.innerHTML = "&#x2715";
        remove_template_button.style.fontSize = "12px";
        remove_template_button.style.padding = "5px";
        remove_template_button.style.textAlign = "center";
        remove_template_button.style.float = "right";
        remove_template_button.style.cursor = "pointer";
        remove_template_button.style.width = "10px";

        remove_template_button.onclick = () => {
            localStorage.removeItem(template_name);
            list_stored_templates();
        };
        template_button_container.appendChild(remove_template_button);

        let template_button = document.createElement("button");
        template_button.innerText = template_name;
        template_button.classList.add("template_button");
        template_button.onclick = () => {
            const template_svg = localStorage.getItem(template_name);
            viewport.innerHTML = template_svg;
            find_fields(template_svg);
            save_buttons_container.style.display = "";
            templates_container.style.display = "none";
            input_template_button.style.display = "none";
        }
        template_button_container.appendChild(template_button);


        templates_container.appendChild(template_button_container);
    })
}


function load_template(){
    input_template.click()
}

function read_template(event){
    var input = event.target;
    var reader = new FileReader();
    reader.onload = function(){
        // read template
        viewport.innerHTML = reader.result
        find_fields(reader.result)
        save_buttons_container.style.display = "";
        templates_container.style.display = "none";
        input_template_button.style.display = "none";
        try {
            localStorage.setItem(input.files[0].name, reader.result);
        } catch (error) {
            alert("The loaded file will not be saved in your local templates because the cache size has reached its limit. Try to avoid inserting big images inside your templates. '" + error + "'")
        }
        // list_stored_templates();
    };
    reader.readAsText(input.files[0]);
}

// find objects with fields and create widgets for them
function find_fields(svg){
    const tree = (new DOMParser()).parseFromString(svg, "application/xml");
    let field_groups = []
    let recursive = (obj) => {
        // if this has editable fields add them to the list
        if(obj.attributes && obj.attributes.fields){
            const str_fields = obj.attributes.fields.value
            const obj_id = obj.attributes.id.value
            let cur_fields = []
            str_fields.split(/\s*;\s*/).forEach(f => {
                const splitted = f.split(/\s*:\s*/)
                if(splitted.length >= 2) {
                    cur_fields.push({
                        name: splitted[0].trim(),
                        type: splitted[1].trim()
                    })
                }
            })
            field_groups.push({name: obj_id, fields: cur_fields})
        }
        // do the same with his children
        if(obj.children){
            Object.values(obj.children).forEach(recursive)
        }
    }
    recursive(tree)
    add_fields(field_groups)
}

// create fields' editors widgets
function add_fields(field_groups){
    fields_container.innerHTML = ""
    field_groups.forEach(group => {
        let group_label = document.createElement("h3");
        group_label.innerText = group.name
        fields_container.appendChild(group_label)
        group.fields.forEach(field => {
            // The special field names are: image, content; the meaning of field.type here is special.
            // Every other field is interpreted as (field.name, field.type) = (field_name, data_type).
            if(field.name === "image") {
                // SPECIAL FIELD: IMAGE
                // field type: keep-width / keep-height / keep-size
                fields_container.appendChild( get_image_loader(group.name, field.type) )
            } else if(field.name === "content") {
                // SPECIAL FIELD: CONTENT
                let types = field.type.split(" ");
                if(types.indexOf("text-multiline") !== -1){
                    // MULTILINE TEXT EDITOR
                    let editor = document.createElement("textarea")
                    editor.value = get_attr(group.name, field.name, field.type)
                    editor.placeholder = editor.value
                    editor.title = field.name;
                    editor.style.height = "200px"
                    // editor.style.width = "400px"
                    editor.oninput = (e) => edit_multiline_text(group.name, e.target.value)
                    fields_container.appendChild(editor)
                }else if(types.indexOf("text") !== -1){
                    // TEXT EDITOR
                    let editor = document.createElement("input")
                    editor.type = "text"
                    editor.value = get_attr(group.name, field.name, field.type)
                    editor.title = field.name;
                    if(editor.type === "text") editor.placeholder = editor.value
                    editor.oninput = (e) => edit_text(group.name, e.target.value)
                    fields_container.appendChild(editor)
                }
            } else {
                // ORDINARY FIELD: (field.name, field.type) = (object property name, property data type)
                if (field.type === "color") {
                    // COLOR PICKER
                    let picker = get_color_picker(group.name, field.name, field.type)
                    picker.title = field.name;
                    fields_container.appendChild(picker)
                } else if(field.type.startsWith("[") && field.type.endsWith("]")) {
                    console.log("CIAO", field.type);
                    // TOGGLE BETWEEN OPTIONS
                    let options = field.type.slice(1,-1).split(",").map(op => op.trim()).filter(op => op !== "");
                    let editor = document.createElement("select");
                    options.forEach(op => {
                        let option = document.createElement("option");
                        option.value = op;
                        option.innerText = op;
                        editor.appendChild(option);
                    })
                    editor.title = field.name;
                    editor.onchange = (e) => edit_attr(group.name, field.name, e.target.value)
                    fields_container.appendChild(editor)
                } else {
                    // GENERIC EDITOR
                    let editor = document.createElement("input")
                    editor.type = {
                        "text": "text",
                        "size": "text",
                        "number": "number",
                    }[field.type];
                    editor.value = get_attr(group.name, field.name, field.type)
                    editor.placeholder = field.name + ": " + editor.value
                    editor.title = field.name;
                    if (editor.type === "number") editor.step = 0.1;
                    editor.oninput = (e) => edit_attr(group.name, field.name, e.target.value)
                    fields_container.appendChild(editor)
                }
            }

        })
    }) 

    // extra space for scrolling
    let space = document.createElement("div")
    space.style.height = "100px";
    fields_container.appendChild(space)
}

function get_attr(element_id, attr, attr_type){
    const element = document.getElementById(element_id)

    if(attr === "content"){
        if(attr_type === "text-multiline"){
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
        return `<tspan x="${x}" y="${y}" dx="0" dy="${spacing*i}${unit}">${line}</tspan>`
    }).join("")
}

// edit_attr: set attribute of a given DOM element
function edit_attr(element_id, attr, value){
    const element = document.getElementById(element_id)
    element.style[attr] = value
}

function get_color_picker(element_id, attr, attr_type){    
    const value = get_attr(element_id, attr, attr_type)

    let color_picker_box = document.createElement("div")
    color_picker_box.className = "color_picker_box"
    color_picker_box.style.backgroundColor = value

    let color_picker = document.createElement("input")
    color_picker.type = "color"
    color_picker.value = value
    color_picker.style.opacity = 0
    color_picker.onchange = (e) => {
        color_picker_box.style.backgroundColor = e.target.value
        edit_attr(element_id, attr, e.target.value)
    }

    color_picker_box.appendChild(color_picker)

    return color_picker_box
}

function get_image_loader(element_id, resize_type){
    let input_file = document.createElement("input")
    input_file.type = "file"
    input_file.style.display = "none"
    input_file.onchange = event => {
        var file = event.target.files[0];
        var reader  = new FileReader();
        // it's onload event and you forgot (parameters)
        reader.onload = function(e)  {
            // the result image data
            const dataurl = e.target.result;
            const image = document.getElementById(element_id)
            image.setAttribute("xlink:href", dataurl)

            const img = new Image()
            img.onload = () => {
                const resize_settings = resize_type.split(/\s+/)
                const image_width = image.getAttribute("width")
                const image_height = image.getAttribute("height")
                const image_centerX = parseFloat(image.getAttribute("x")) + (image_width/2)
                const image_centerY = parseFloat(image.getAttribute("y")) + (image_height/2)

                // const image_ratio = image_height / image_width
                const new_ratio = img.height / img.width
                let new_width = image_width
                let new_height = image_height
                if(resize_settings.indexOf("keep-width") !== -1){
                    // resize height accordingly
                    new_height = new_ratio * image_width
                }else if(resize_settings.indexOf("keep-height") !== -1){
                    // resize width accordingly
                    new_width = image_height / new_ratio
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
            img.src = dataurl
        }
        // you have to declare the file loading
        reader.readAsDataURL(file);
    }

    let input_file_button = document.createElement("button")
    input_file_button.innerText = "IMAGE"
    input_file_button.onclick = () => input_file.click()
    input_file_button.accept = ".jpg,.jpeg,.png"

    let input_file_box = document.createElement("div")
    input_file_box.appendChild(input_file)
    input_file_box.appendChild(input_file_button)

    return input_file_button
}

list_stored_templates()
save_buttons_container.style.display = "none";