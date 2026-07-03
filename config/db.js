const sql = require('mssql');
require('dotenv').config();

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  // port: 27017,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  }
};

let poolPromise;

function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config)
      .connect()
      .then(pool => {
        console.log("SQL Pool Created");

        pool.on("error", err => {
          console.error(err);
          poolPromise = null;
        });

        return pool;
      })
      .catch(err => {
        poolPromise = null;
        throw err;
      });
  }

  return poolPromise;
}

async function query(sqlText, params = {}) {
  const pool = await getPool();

  const request = pool.request();

  Object.entries(params).forEach(([k, v]) => {
    request.input(k, v);
  });

  return request.query(sqlText);
}


module.exports = { sql, getPool, query };
