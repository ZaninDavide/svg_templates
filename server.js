const dotenv = require("dotenv")
const express = require("express")
const path = require("path"); // Import the path module
const { jwtDecode } = require("jwt-decode")

dotenv.config()
const PORT = process.env.PORT || 3003

const google_resource_server_url = "https://www.googleapis.com/oauth2/v4/token";

async function main() {
    const app = express()

    // SERVE WEBAPP FILES
    app.use("/webapp", express.static('webapp'))

    // SERVE HOME PAGE
    app.get("/", (req, res) => {
        res.sendFile(path.join(__dirname, 'webapp', 'index.html'));
    })

    // RESPOND TO THE OAUTH REDIRECT
    app.get("/oauth", async function(req, res) {
        let error = req.query.error;
        if(error !== undefined) {
            // ERROR
            console.log("❌ OAuth Error: " + error);
            res.redirect("/");
        }else if(req.query.state === undefined) {
            // NO STATE PROVIDED
            console.log("❌ We do not accept OAuth requests with no state specified");
            res.redirect("/");
        }else {
            // EXCHANGE THE CODE (req.query.code) FOR AN ACCESS TOKEN AND AN ID TOKEN
            if(req.query.state.startsWith("Google")) {
                // GOOGLE
                // console.log("✅ OAuth With Google: " + JSON.stringify(req.query));
                const params = new URLSearchParams();
                params.append("grant_type", "authorization_code");
                params.append("code", req.query.code);
                params.append("redirect_uri", process.env.REDIRECT_URI);
                params.append("client_id", process.env.CLIENT_ID);
                params.append("client_secret", process.env.CLIENT_SECRET);
                let response = await fetch(google_resource_server_url, { 
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: params
                })
                if (response.ok) {
                    // Code for token exchanged successfully
                    const data = await response.json(); // {access_token, expires_in, scope, id_token }
                    const userinfo_response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
                        headers: { 'Authorization': 'Bearer ' + data.access_token}
                    });
                    const unique_user_id = jwtDecode(data.id_token).sub;
                    if(userinfo_response.ok) {
                        const userinfo = await userinfo_response.json();  // {id, email, verified_email, picture}
                        const user_params = new URLSearchParams();
                        user_params.append("UUID", unique_user_id)
                        user_params.append("email", userinfo.email)
                        res.redirect("/?" + user_params);
                    }else{
                        // Error exchanging code for token
                        console.log(`❌ Could not read userinfo. Status: ${userinfo_response.status}. Error: ${userinfo_response.statusText}`);
                        res.redirect("/");
                    }
                }else{
                    // Error exchanging code for token
                    console.log(`❌ Could not exchange code for token. Status: ${response.status}. Error: ${response.statusText}`);
                    res.redirect("/");
                }
            }else{
                console.log("❌ Unknown OAuth State: " + req.query.state);
            }
        }
    })
      
    // RUN SERVER
    app.listen(PORT, () => {
        console.log(`✅ Server listening on port ${PORT}`)
    })
}

main()