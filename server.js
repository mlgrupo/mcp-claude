require('dotenv').config()
const express = require('express')
const { Pool } = require('pg')

const app = express()
app.use(express.json({ limit: '1mb' }))

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

app.post('/mcp', async (req, res) => {

  const token = req.query.token
  if (token !== process.env.SECRET_TOKEN) {
    return res.status(401).json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32098, message: "Unauthorized" }
    })
  }

  const { id, method, params } = req.body

  try {

    // 🔹 1️⃣ Initialize
    if (method === "initialize") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: "Postgres MCP",
            version: "1.0.0"
          }
        }
      })
    }

    // 🔹 2️⃣ List Tools
    if (method === "tools/list") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            {
              name: "sql_select",
              description: "Execute a SELECT query on PostgreSQL (read-only)",
              inputSchema: {
                type: "object",
                properties: {
                  sql: {
                    type: "string",
                    description: "SQL SELECT query"
                  }
                },
                required: ["sql"]
              }
            }
          ]
        }
      })
    }

    // 🔹 3️⃣ Call Tool
    if (method === "tools/call") {

      const { name, arguments: args } = params

      if (name !== "sql_select") {
        return res.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: "Tool not found" }
        })
      }

      let sql = args?.sql

      if (!sql || !sql.trim().toLowerCase().startsWith("select")) {
        return res.json({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32000,
            message: "Only SELECT queries are allowed"
          }
        })
      }

      // adiciona limite automático
      if (!sql.toLowerCase().includes("limit")) {
        sql += " LIMIT 100"
      }

      const result = await pool.query(sql)

      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.rows, null, 2)
            }
          ]
        }
      })
    }

    // 🔹 Método não suportado
    return res.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Method not found" }
    })

  } catch (err) {
    console.error(err)

    return res.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32001, message: "Internal server error" }
    })
  }
})

app.listen(process.env.PORT, () => {
  console.log(`🚀 MCP Server rodando na porta ${process.env.PORT}`)
})
