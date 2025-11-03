/**
 * Status Page - PostgreSQL Version
 *
 * Simple status endpoint that shows database statistics
 */

import express from 'express'
import { getStats } from './libs/db'

const server = express.Router()

server.get('/', async (req, res) => {
	try {
		const stats = await getStats()

		const html = `
<!DOCTYPE html>
<html>
<head>
	<title>TCGdex API Status</title>
	<style>
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
			max-width: 800px;
			margin: 50px auto;
			padding: 20px;
			background: #f5f5f5;
		}
		.container {
			background: white;
			padding: 30px;
			border-radius: 8px;
			box-shadow: 0 2px 4px rgba(0,0,0,0.1);
		}
		h1 {
			color: #333;
			margin-top: 0;
		}
		.status {
			display: flex;
			align-items: center;
			margin-bottom: 20px;
		}
		.status-indicator {
			width: 12px;
			height: 12px;
			border-radius: 50%;
			background: #4CAF50;
			margin-right: 10px;
		}
		.stats {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
			gap: 20px;
			margin-top: 30px;
		}
		.stat-card {
			background: #f9f9f9;
			padding: 20px;
			border-radius: 6px;
			border-left: 4px solid #2196F3;
		}
		.stat-value {
			font-size: 32px;
			font-weight: bold;
			color: #2196F3;
		}
		.stat-label {
			color: #666;
			margin-top: 5px;
			font-size: 14px;
		}
		.footer {
			margin-top: 30px;
			padding-top: 20px;
			border-top: 1px solid #eee;
			color: #666;
			font-size: 12px;
		}
	</style>
</head>
<body>
	<div class="container">
		<h1>TCGdex API Status</h1>

		<div class="status">
			<div class="status-indicator"></div>
			<span>All systems operational (PostgreSQL)</span>
		</div>

		<div class="stats">
			<div class="stat-card">
				<div class="stat-value">${Number(stats.total_cards).toLocaleString()}</div>
				<div class="stat-label">Total Cards</div>
			</div>

			<div class="stat-card">
				<div class="stat-value">${Number(stats.total_sets).toLocaleString()}</div>
				<div class="stat-label">Sets</div>
			</div>

			<div class="stat-card">
				<div class="stat-value">${Number(stats.total_series).toLocaleString()}</div>
				<div class="stat-label">Series</div>
			</div>

			<div class="stat-card">
				<div class="stat-value">${Number(stats.total_variants).toLocaleString()}</div>
				<div class="stat-label">Card Variants</div>
			</div>

			<div class="stat-card">
				<div class="stat-value">${Number(stats.total_sealed_products).toLocaleString()}</div>
				<div class="stat-label">Sealed Products</div>
			</div>
		</div>

		<div class="footer">
			<p>
				<strong>Database:</strong> PostgreSQL<br>
				<strong>Architecture:</strong> Multi-game ready (Pokemon, Magic: The Gathering, Yu-Gi-Oh, etc.)<br>
				<strong>API Version:</strong> 2.0<br>
				<strong>Status:</strong> Migrated from JSON to PostgreSQL ✅
			</p>
		</div>
	</div>
</body>
</html>
		`

		res.setHeader('Content-Type', 'text/html')
		res.send(html)
	} catch (error) {
		console.error('Error fetching stats:', error)
		res.status(500).send(`
<!DOCTYPE html>
<html>
<head>
	<title>TCGdex API Status - Error</title>
	<style>
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
			max-width: 800px;
			margin: 50px auto;
			padding: 20px;
			background: #f5f5f5;
		}
		.container {
			background: white;
			padding: 30px;
			border-radius: 8px;
			box-shadow: 0 2px 4px rgba(0,0,0,0.1);
		}
		.error {
			color: #f44336;
		}
	</style>
</head>
<body>
	<div class="container">
		<h1 class="error">Database Error</h1>
		<p>Unable to connect to PostgreSQL database.</p>
		<p><code>${error}</code></p>
	</div>
</body>
</html>
		`)
	}
})

export default server
