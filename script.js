const viewport = document.getElementById("viewport")
const fields_container = document.getElementById("fields")
const input_template = document.getElementById("input_template")

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
    };
    reader.readAsText(input.files[0]);
}

function find_fields(svg){
    const tree = (new DOMParser()).parseFromString(svg, "application/xml");
    let fields = []
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
                        name: splitted[0],
                        type: splitted[1]
                    })
                }
            })
            fields.push({name: obj_id, fields: cur_fields})
        }
        // do the same with his children
        if(obj.children){
            Object.values(obj.children).forEach(recursive)
        }
    }
    recursive(tree)
    add_fields(fields)
}

function add_fields(fields){
    fields_container.innerHTML = ""
    fields.forEach(group => {
        let group_label = document.createElement("h3");
        group_label.innerText = group.name
        fields_container.appendChild(group_label)
        group.fields.forEach(field => {
            // let field_label = document.createElement("p")
            // field_label.innerText = field.name + ": "
            // fields_container.appendChild(field_label)
            if(field.type === "color"){
                let picker = get_color_picker(group.name, field.name)

                fields_container.appendChild(picker)
            }else if(field.name === "image"){
                fields_container.appendChild( get_image_loader(group.name, field.type) )
            }else{
                let editor = document.createElement("input")
                editor.type = editor_type[field.type]
                editor.value = get_attr(group.name, field.name)
                if(editor.type === "text") editor.placeholder = editor.value
                editor.onchange = (e) => edit_attr(group.name, field.name, e.target.value)

                fields_container.appendChild(editor)
            }

        })
    }) 
}

function get_attr(element_id, attr){
    const element = document.getElementById(element_id)

    if(attr === "content"){
        return element.innerHTML
    }else{
        return element.style[attr]
    }
}

function edit_attr(element_id, attr, value){
    const element = document.getElementById(element_id)
    // const value = get_attr(group.name, field.name)

    if(attr === "content"){
        element.innerHTML = value.toString()
    }else{
        element.style[attr] = value
    }
}

function get_color_picker(element_id, attr){    
    const value = get_attr(element_id, attr)

    let color_picker_box = document.createElement("div")
    color_picker_box.className = "color_picker_box"
    color_picker_box.style.backgroundColor = value

    let color_picker = document.createElement("input")
    color_picker.type = "color"
    color_picker.value = value
    color_picker.style.opacity = 0
    color_picker.onchange = (e) => {
        const color = get_attr(element_id, attr)
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
                const image_width = image.getAttribute("width")
                const image_height = image.getAttribute("height")
                // const image_ratio = image_height / image_width
                const new_ratio = img.height / img.width
                if(resize_type === "keep-width"){
                    // resize height accordingly
                    image.setAttribute("height", new_ratio * image_width)
                }else if(resize_type === "keep-height"){
                    // resize width accordigly
                    image.setAttribute("width",  image_height / new_ratio)
                }else if(resize_type === "keep-size"){
                    // nothing to do
                }
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

const editor_type = {
    "size": "text",
    "number": "number",
    "color": "color",
    "rgb": "color",
    "rgba": "color",
    "text": "text",
    "string": "string",
}