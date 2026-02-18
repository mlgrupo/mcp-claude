require('dotenv').config()
const express = require('express')
const { Pool } = require('pg')

const app = express()
app.use(express.json({ limit: '1mb' }))

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

/**
 * ✅ Permite GET para healthcheck do Claude
 */
app.get('/mcp', (req, res) => {
  res.status(200).send('MCP Server Running')
})

app.post('/mcp', async (req, res) => {

  const { id, method, params } = req.body

  try {

    // 🔹 Initialize (não exige token)
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

    // 🔒 Exige token APÓS initialize
    const token = req.query.token
    if (token !== process.env.SECRET_TOKEN) {
      return res.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32098, message: "Unauthorized" }
      })
    }

    // 🔹 List Tools
    if (method === "tools/list") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            {
              name: "sql_select",
              description: "Execute SELECT query (read-only)",
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

    // 🔹 Call Tool
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
      error: { code: -32001, message: "Internal error" }
    })
  }
})

app.listen(process.env.PORT, () => {
  console.log(`🚀 MCP Server rodando na porta ${process.env.PORT}`)
})
