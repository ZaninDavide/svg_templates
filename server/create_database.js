const pg = require('pg')
const dotenv = require("dotenv")
dotenv.config()

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
    try {
        // We connect to the database specified in the .env
        await client.connect()
        // Drop old tables
        await client.query("DROP TABLE Users")
        await client.query("DROP TABLE Templates")
        await client.query("DROP TABLE TemplateOwnerPairs")
        // Create tables
        await client.query(`CREATE TABLE Users ( 
            id BIGSERIAL NOT NULL PRIMARY KEY, 
            google_uuid VARCHAR(255) NOT NULL, 
            email VARCHAR(256) NOT NULL, 
            given_name VARCHAR(255), 
            family_name VARCHAR(255),
            picture VARCHAR(255)
        )`)
        await client.query(`CREATE TABLE Templates ( 
            id BIGSERIAL NOT NULL PRIMARY KEY, 
            title VARCHAR(255), 
            svg BYTEA NOT NULL 
        )`)
        await client.query(`CREATE TABLE TemplateOwnerPairs ( 
            userid BIGSERIAL NOT NULL, 
            svgid BIGSERIAL NOT NULL 
        )`)
    } catch (err) {
        console.error(err);
    } finally {
        client.end()
            .then(() => console.log('Disconnected from the database ✅'))
            .catch(err => console.error('Error closing client ❌', err));
    }

}

main()

/*
DROP TABLE Users;

CREATE TABLE Users (
	id BIGSERIAL NOT NULL PRIMARY KEY,
	google_uuid VARCHAR(255) NOT NULL,
	email VARCHAR(256) NOT NULL
); 

INSERT INTO Users (google_uuid, email) VALUES ('teststring', 'fake@mail')

// Add a new user to the table
await client.query("INSERT INTO Users (google_uuid, email) VALUES ('myteststring', 'myfake@mail')")
// Read about this user
const emails = await client.query('SELECT id, email FROM Users');
console.log(emails.rows);
*/