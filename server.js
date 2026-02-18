require('dotenv').config()
const express = require('express')
const { Pool } = require('pg')

const app = express()
app.use(express.json({ limit: '1mb' }))

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

// Health check COM teste de banco - ANTES de tudo
app.get('/mcp/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT 1 as ok')
    res.json({ status: 'ok', db: result.rows[0] })
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message })
  }
})

// Health check simples
app.get('/mcp', (req, res) => {
  res.status(200).json({ status: 'ok', server: 'Postgres MCP' })
})

app.post('/mcp', async (req, res) => {
  const { id, method, params } = req.body

  console.log('REQUEST:', method, JSON.stringify(params || {}).substring(0, 200))

  res.setHeader('Content-Type', 'application/json')

  const send = (payload) => {
    console.log('RESPONSE:', method, JSON.stringify(payload).substring(0, 300))
    return res.json(payload)
  }

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
      console.log('AUTH FAILED - token recebido:', token ? 'presente mas incorreto' : 'ausente')
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
              description: 'Execute SELECT query (read-only) on PostgreSQL database. Use this to query any table. Start with: SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\'',
              inputSchema: {
                type: 'object',
                properties: {
                  sql: {
                    type: 'string',
                    description: 'SQL SELECT query to execute. Only SELECT statements are allowed.'
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
      console.log('TOOL CALL:', JSON.stringify(params, null, 2))

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

      console.log('EXECUTING SQL:', sql)

      const result = await pool.query(sql)

      console.log('SQL OK - rows:', result.rows.length)

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
    console.error('MCP ERROR:', err.message, err.stack)
    return send({
      jsonrpc: '2.0',
      id,
      error: { code: -32001, message: 'DB Error: ' + err.message }
    })
  }
})

app.listen(process.env.PORT || 3000, () => {
  console.log(`MCP Server rodando na porta ${process.env.PORT || 3000}`)
})