import asyncio
import os
import json
from dotenv import load_dotenv
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

load_dotenv()

server_params = StdioServerParameters(
    command="node",
    args=["build/index.js"], 
    env={
        **os.environ,
        "MONGODB_URI": os.getenv("MONGODB_URI"),
        "MCP_API_TOKEN": os.getenv("MCP_API_TOKEN")
    }
)

async def check_schemas():
    async with stdio_client(server_params, errlog=None) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            
            collections = ["convoylobby", "coupons", "contracthistories", "ncevents", "pointhistories"]
            for col in collections:
                print(f"--- Schema for {col} ---")
                res = await session.call_tool("get_collection_schema", arguments={"collectionName": col})
                print(res.content[0].text[:1000]) # Print max 1000 chars

asyncio.run(check_schemas())
