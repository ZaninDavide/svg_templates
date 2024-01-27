const viewport = document.getElementById("viewport")
const fields_container = document.getElementById("fields")
const templates_container = document.getElementById("templates")
const input_template = document.getElementById("input_template")
const input_template_button = document.getElementById("input_template_button")
const save_buttons_container = document.getElementById("save_buttons_container")
const overlay = document.getElementById("overlay")

let field_groups = [];

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
        return `<tspan x="${x}" y="${y}" dx="0" dy="${spacing*i}${unit}">${line}</tspan>`
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

    const lines = value.split(/\n\r|\n|\r|\r\n/);

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
    element.style[attr] = value
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
    input_file_button.accept = ".jpg,.jpeg,.png,.svg"

    let input_file_box = document.createElement("div")
    input_file_box.appendChild(input_file)
    input_file_box.appendChild(input_file_button)

    return input_file_button
}

list_stored_templates()
save_buttons_container.style.display = "none";

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