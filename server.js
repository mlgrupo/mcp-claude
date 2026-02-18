require('dotenv').config()
const express = require('express')
const { Pool } = require('pg')

const app = express()
app.use(express.json({ limit: '1mb' }))

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

// Health check
app.get('/mcp', (req, res) => {
  res.status(200).json({ status: 'ok', server: 'Postgres MCP' })
})

app.post('/mcp', async (req, res) => {
  const { id, method, params } = req.body

  // Sempre responde como JSON-RPC [porque o Claude.ai aceita tanto SSE quanto JSON direto,
  // mas JSON é mais estável pra esse tipo de server]
  res.setHeader('Content-Type', 'application/json')

  const send = (payload) => res.json(payload)

  try {
    // Initialize - sem auth
    if (method === 'initialize') {
      return send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'Postgres MCP',
            version: '1.0.0'
          }
        }
      })
    }

    // Auth pra tudo depois do initialize
    const token = req.query.token
    if (token !== process.env.SECRET_TOKEN) {
      return send({
        jsonrpc: '2.0',
        id,
        error: { code: -32098, message: 'Unauthorized' }
      })
    }

    // notifications/initialized - Claude manda isso após initialize
    if (method === 'notifications/initialized') {
      return res.status(204).end()
    }

    if (method === 'tools/list') {
      return send({
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: 'sql_select',
              description: 'Execute SELECT query (read-only) on PostgreSQL database',
              inputSchema: {
                type: 'object',
                properties: {
                  sql: {
                    type: 'string',
                    description: 'SQL SELECT query to execute'
                  }
                },
                required: ['sql']
              }
            }
          ]
        }
      })
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params

      if (name !== 'sql_select') {
        return send({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: 'Tool not found' }
        })
      }

      let sql = args?.sql

      if (!sql || !sql.trim().toLowerCase().startsWith('select')) {
        return send({
          jsonrpc: '2.0',
          id,
          error: { code: -32000, message: 'Only SELECT allowed' }
        })
      }

      if (!sql.toLowerCase().includes('limit')) {
        sql += ' LIMIT 100'
      }

      const result = await pool.query(sql)

      return send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.rows, null, 2)
            }
          ]
        }
      })
    }

    return send({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: 'Method not found' }
    })

  } catch (err) {
    console.error('MCP Error:', err.message)
    return send({
      jsonrpc: '2.0',
      id,
      error: { code: -32001, message: err.message || 'Internal error' }
    })
  }
})

app.listen(process.env.PORT || 3000, () => {
  console.log(`MCP Server rodando na porta ${process.env.PORT || 3000}`)
})