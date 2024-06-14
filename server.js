const dotenv = require("dotenv")
const express = require("express")
const path = require("path"); // Import the path module
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

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
            // OAUTH ERROR
            error_redirect(res, "OAuth Error: " + error);
            return;
        }else if(req.query.state === undefined) {
            // NO STATE PROVIDED
            error_redirect(res, "We do not accept OAuth requests with no state specified");
            return;
        }

        // EXCHANGE THE CODE (req.query.code) FOR AN ACCESS TOKEN (data.access_token) AND AN ID TOKEN (data.id_token)
        if(req.query.state.startsWith("Google")) {
            // GOOGLE: get 'access_token' and 'id_token'
            const params = new URLSearchParams();
            params.append("grant_type", "authorization_code"); // request access token
            params.append("code", req.query.code);
            params.append("redirect_uri", process.env.REDIRECT_URI);
            params.append("client_id", process.env.CLIENT_ID);
            params.append("client_secret", process.env.CLIENT_SECRET);
            let response = await fetch(google_resource_server_url, { 
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: params
            })
            if(!response.ok) {
                // Error exchanging code for token
                error_redirect(res, `Could not exchange code for token. Status: ${response.status}. Error: ${response.statusText}`);
                return;
            }
            const data = await response.json(); // { access_token, expires_in, scope, id_token, refresh_token }

            // Verify User
            const JWT = verify_google_user_with_id_token(data.id_token);

            // Use access_token to get user info
            /*
            const userinfo_response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
                headers: { 'Authorization': 'Bearer ' + data.access_token}
            });
            if(!userinfo_response.ok) { 
                // Error reading user info
                error_redirect(res, `Could not read userinfo. Status: ${userinfo_response.status}. Error: ${userinfo_response.statusText}`);
                return;
            }
            const userinfo = await userinfo_response.json();  // {id, email, verified_email, picture}
            */

            const user_params = new URLSearchParams();
            user_params.append("id_token", data.id_token.toString())
            res.redirect("/?" + user_params);
        }else{
            error_redirect(res, "Unknown OAuth State: " + req.query.state);
            return;
        }
    })
      
    // RUN SERVER
    app.listen(PORT, () => {
        console.log(`✅ Server listening on port ${PORT}`)
    })
}

// Verify User
async function verify_google_user_with_id_token(id_token) {
    // Verify JWT
    let JWT = await verify_jwt(id_token);
    if(!JWT) {
        error_redirect(res, `The JWT could not be verified.`);
        return;
    }
    if(JWT.iss !== "https://accounts.google.com") {
        // The token should be signed by Google
        error_redirect(res, `The JWT should be signed by https://accounts.google.com. ISS: ${JWT.iss}`);
        return;
    }
    if(!JWT.email_verified) {
        // The email should be verified
        error_redirect(res, `The email should be verified`);
        return;
    }
    // console.log("User '" + JWT.sub + "' logged in with email '" + JWT.email + "'");
    // JWT.sub (UUID), JWT.iat (Creation Date), JWT.exp (Expiring Date), JWT.email
    return JWT;
}

// Verify the JWT signature
const jwksUri = 'https://www.googleapis.com/oauth2/v3/certs';
async function verify_jwt(token) {
  const client = jwksClient({ jwksUri: jwksUri });

  const decodedToken = jwt.decode(token, { complete: true });
  if(!decodedToken) return false;

  const kid = decodedToken.header.kid;

  const key = await new Promise((resolve, reject) => {
    client.getSigningKey(kid, (err, key) => {
      if (err) reject(err);
      else resolve(key.publicKey || key.rsaPublicKey);
    });
  });

  return jwt.verify(token, key);
}

function error_redirect(res, error) {
    const string = "OAuth Error: " + error;
    const params = new URLSearchParams();
    params.append("error", string);
    console.log("❌ " + string);
    res.redirect("/?" + params);
}

main()