const dotenv = require("dotenv")
const express = require("express")
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const pg = require('pg')
const https = require('https')
const fs = require('fs')
const cors = require('cors');

dotenv.config()

const LOCAL = !process.env.PORT
const PORT = LOCAL ? 3003 : process.env.PORT
const HOME = LOCAL ? "http://localhost:3000" : "https://template.baida.dev"
const SERVER = LOCAL ? "http://localhost:3003" : "https://template.baida.dev:3009";

const google_resource_server_url = "https://www.googleapis.com/oauth2/v4/token";

const { Client } = pg
const client = new Client({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    port: process.env.PGPORT,
    ssl: {
        rejectUnauthorized: false, // Set to true if using a self-signed certificate
    },
    sslmode: 'require',
})

async function main() {
    await client.connect()

    const app = express()
    app.use(cors());
    app.use(express.json({limit: "2mb"}));
    app.use(express.urlencoded({ limit: "2mb", extended: true }));

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
            const userinfo_response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { 'Authorization': 'Bearer ' + data.access_token}
            });
            if(!userinfo_response.ok) { 
                // Error reading user info
                error_redirect(res, `Could not read userinfo. Status: ${userinfo_response.status}. Error: ${userinfo_response.statusText}`);
                return;
            }
            const userinfo = await userinfo_response.json();

            const google_uuid = userinfo.sub;
            client.query("SELECT * FROM Users WHERE google_uuid = $1", [google_uuid], async (err, dbres) => {
                if(err) {
                    console.log("Error: " + JSON.stringify(err));
                    res.status(500).redirect("/");
                } else {
                    if(dbres.rowCount === 0) {
                        // THIS IS A NEW USER
                        await client.query(
                            "INSERT INTO Users (google_uuid, email, given_name, family_name, picture) VALUES ($1, $2, $3, $4, $5)", 
                            [ google_uuid, userinfo.email, userinfo.given_name, userinfo.family_name, userinfo.picture ]
                        )
                    } else if (dbres.rowCount === 1) {
                        await client.query(
                            "UPDATE Users SET email = $2, given_name = $3, family_name = $4, picture = $5 WHERE google_uuid = $1", 
                            [ google_uuid, userinfo.email, userinfo.given_name, userinfo.family_name, userinfo.picture ]
                        )
                    }
                    if(LOCAL){
                        res.redirect(HOME + "/app?google_id_token=" + data.id_token.toString());
                    }else{
                        res.redirect(HOME + "/app.html?google_id_token=" + data.id_token.toString());
                    }
                }
            })
        }else{
            error_redirect(res, "Unknown OAuth State: " + req.query.state);
            return;
        }
    })

    // GET USER TEMPLATES LIST
    app.get("/user/templates", checkAuthorization, getUserId, (req, res) => {
        getTemplatesList(req.id).then(result => {
            res.json(result);
        }).catch(err => {
            res.status(400).send(err.toString())
        })
    })

    // UPLOAD TEMPLATE
    app.post("/user/upload_template", checkAuthorization, getUserId, async (req, res) => {
        if(!req.body || !req.body.title || !req.body.svg) { res.status(400).send("The title, the svg code or both are missing from the body.") }
        const title = req.body.title.toString()
        const svg = req.body.svg.toString()
        const textEncoder = new TextEncoder();
        const size = textEncoder.encode(svg).length;
        if(size > 2*1024*1024) { res.status(507).send("File is too large (max 2MB).") }

        try {
            await client.query('BEGIN');
            const result = await client.query(
                "INSERT INTO Templates (title, svg) VALUES ($1, $2) RETURNING id",
                [title, svg]
            );
            const svgid = result?.rows[0]?.id;
            if(svgid === null && svgid === undefined && svgid === NaN) throw "Invalid template ID.";
            await client.query(
                "INSERT INTO TemplateOwnerPairs (svgid, userid) VALUES ($1, $2)",
                [svgid, req.id]
            );
            await client.query('COMMIT');
            res.status(201).send("Ok")
        } catch (e) {
            client.query('ROLLBACK');
            res.status(500).send("Error uploading template to database: " + e.toString() + ".")
        }
    })

    // GET TEMPLATE
    app.post("/user/get_template", checkAuthorization, getUserId, async (req, res) => {
        if(!req.body || !req.body.svgid ) { res.status(400).send("The svg ID is missing from the body.") }
        const svgid = req.body.svgid.toString()
        try {
            const result = await client.query(`
                SELECT encode(Templates.svg, 'escape')
                FROM 
                    TemplateOwnerPairs INNER JOIN Templates 
                    ON TemplateOwnerPairs.svgid=Templates.id 
                WHERE TemplateOwnerPairs.userid = $1 AND Templates.id = $2
            `, [req.id, svgid]);
            const rows = result?.rows;
            if(rows[0]?.encode) {
                res.send(rows[0].encode)
            }else{
                res.status(400).send("Template not found.")
            }
        } catch (e) {
            res.status(500).send("Error downloading template from database: " + e.toString() + ".")
        }
    })

    // DELETE TEMPLATE
    app.post("/user/delete_template", checkAuthorization, getUserId, async (req, res) => {
        if(!req.body || !req.body.svgid ) { res.status(400).send("The svg ID is missing from the body.") }
        const svgid = req.body.svgid.toString()
        try {
            await client.query('BEGIN');
            await client.query(
                `DELETE FROM Templates WHERE id = $2 AND id IN (
                    SELECT svgid 
                    FROM TemplateOwnerPairs 
                    WHERE userid = $1
                );`,
                [req.id, svgid]
            );
            await client.query(
                `DELETE FROM TemplateOwnerPairs WHERE userid = $1 AND svgid = $2`,
                [req.id, svgid]
            );
            await client.query('COMMIT');
            res.send("Ok")
        } catch (e) {
            res.status(500).send("Error deleting template from database: " + e.toString() + ".")
        }
    })

    // ERROR
    app.all('/error', (req, res) => {
        // Todo link back to homepage
        res.status(404).send(`<h1>Error</h1><p>${req.query.error || "Unknown error"}</p>`);
    });

    // ERROR 404
    app.all('*', (req, res) => {
        // Todo link back to homepage
        res.status(404).send('<h1>404! Page not found</h1>');
    });
      
    // RUN SERVER
    if(!process.env.TLS_DIR){ 
        // Development
        app.listen(PORT, () =>
            console.log(`✅ Server listening on port ${PORT}`)
        )
    }else{
        // Production
        var privateKey  = fs.readFileSync(process.env.TLS_DIR+'/privkey.pem', 'utf8');
        var certificate = fs.readFileSync(process.env.TLS_DIR+'/cert.pem', 'utf8');
        let credentials = {key: privateKey, cert: certificate};
        let httpsServer = https.createServer(credentials, app);
        httpsServer.listen(PORT)
    }
}

// READ USER FROM DATABASE

function getUserId(req, res, next) {
    client.query("SELECT (id) FROM Users WHERE google_uuid = $1", [req.jwt.sub], async (err, dbres) => {
        if(err) {
            res.status(500).send("Failed to read from database with error '" + JSON.stringify(err) + "'")
        } else {
            if (dbres.rowCount === 1) {
                req.id = dbres.rows[0].id
                next()
            } else if (dbres.rowCount === 0) {
                res.status(400).send("User not found.")
            } else {
                res.status(500).send("Unreachable code reached.")
            }
        }
    })
}

async function getTemplatesList(userid) {
    return new Promise(async (resolve, reject) => {
        client.query(`
            SELECT row_to_json(row) Templates
            FROM (
                SELECT TemplateOwnerPairs.svgid, Templates.title
                FROM TemplateOwnerPairs 
                INNER JOIN Templates ON TemplateOwnerPairs.svgid = Templates.id 
                WHERE TemplateOwnerPairs.userid = $1
            ) row
        `, [userid], async (err, dbres) => {
            if(err) {
                reject("Failed to read from database with error: " + JSON.stringify(err) + ".")
                return;
            }
            resolve(dbres.rows)
        })
    })
}

// AUTHORIZATION CHECKING

async function checkAuthorization(req, res, next) {
    const header = req.headers["authorization"]

    if (!header || !header.startsWith("GoogleIdToken ")) {
        res.status(400).send("Set the google id token in the header")
        return
    }

    const id_token = header.substring("GoogleIdToken ".length)

    try {
        const decoded = await verify_google_user_with_id_token(id_token)
        if(decoded.error) { res.status(401).send("Invalid token: " + decoded.error) }
        req.jwt = decoded
        next()
    } catch (e) {
        res.status(401).send("Error decoding token.")
        return
    }
}

async function verify_google_user_with_id_token(id_token) {
    // Verify JWT
    let JWT = await verify_jwt(id_token);
    if(!JWT) {
        return {error: `The JWT could not be verified.`};
    }
    if(JWT.iss !== "https://accounts.google.com") {
        // The token should be signed by Google
        return {error: `The JWT should be signed by https://accounts.google.com. ISS: ${JWT.iss}`};
    }
    if(!JWT.email_verified) {
        // The email should be verified
        return {error: `The email should be verified`};
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
    res.redirect(SERVER + "/error/?" + params);
}

main()