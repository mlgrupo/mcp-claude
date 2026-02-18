require('dotenv').config()
const express = require('express')
const { Pool } = require('pg')

const app = express()
app.use(express.json({ limit: '1mb' }))

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

// Middleware de autenticação
app.use((req, res, next) => {
  const auth = req.headers.authorization
  if (auth !== `Bearer ${process.env.SECRET_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
})

// Endpoint MCP
app.post('/mcp', async (req, res) => {
  const { id, method, params } = req.body

  try {
    // 🔹 Handshake inicial
    if (method === 'initialize') {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          capabilities: {
            tools: true
          },
          serverInfo: {
            name: "Postgres MCP Server",
            version: "1.0.0"
          }
        }
      })
    }

    // 🔹 Query SQL
    if (method === 'query') {

      const sql = params?.sql

      if (!sql || !sql.trim().toLowerCase().startsWith('select')) {
        return res.json({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32000,
            message: "Only SELECT queries are allowed"
          }
        })
      }

      const result = await pool.query(sql)

      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          rows: result.rows
        }
      })
    }

    // 🔹 Método não suportado
    return res.json({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: "Method not found"
      }
    })

  } catch (err) {
    console.error(err)

    return res.json({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32001,
        message: "Internal server error"
      }
    })
  }
})

app.listen(process.env.PORT, () => {
  console.log(`🚀 MCP Server rodando na porta ${process.env.PORT}`)
})
