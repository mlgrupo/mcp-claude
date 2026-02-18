require('dotenv').config()
const express = require('express')
const { Pool } = require('pg')

const app = express()
app.use(express.json({ limit: '1mb' }))

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

app.get('/mcp', (req, res) => {
  res.status(200).send('MCP Server Running')
})

app.post('/mcp', async (req, res) => {

  const acceptsSSE = req.headers.accept?.includes('text/event-stream')

  if (acceptsSSE) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
  } else {
    res.setHeader('Content-Type', 'application/json')
  }

  const send = (payload) => {
    if (acceptsSSE) {
      res.write(`event: message\n`)
      res.write(`data: ${JSON.stringify(payload)}\n\n`)
      res.end()
    } else {
      res.json(payload)
    }
  }

  const { id, method, params } = req.body

  try {

    // 🔹 Initialize (não exige token)
    if (method === "initialize") {
      return send({
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

    // 🔒 Token após initialize
    const token = req.query.token
    if (token !== process.env.SECRET_TOKEN) {
      return send({
        jsonrpc: "2.0",
        id,
        error: { code: -32098, message: "Unauthorized" }
      })
    }

    if (method === "tools/list") {
      return send({
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
                  sql: { type: "string" }
                },
                required: ["sql"]
              }
            }
          ]
        }
      })
    }

    if (method === "tools/call") {

      const { name, arguments: args } = params

      if (name !== "sql_select") {
        return send({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: "Tool not found" }
        })
      }

      let sql = args?.sql

      if (!sql || !sql.trim().toLowerCase().startsWith("select")) {
        return send({
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message: "Only SELECT allowed" }
        })
      }

      if (!sql.toLowerCase().includes("limit")) {
        sql += " LIMIT 100"
      }

      const result = await pool.query(sql)

      return send({
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

    return send({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Method not found" }
    })

  } catch (err) {
    console.error(err)
    return send({
      jsonrpc: "2.0",
      id,
      error: { code: -32001, message: "Internal error" }
    })
  }
})

app.listen(process.env.PORT, () => {
  console.log(`🚀 MCP Server rodando na porta ${process.env.PORT}`)
})
