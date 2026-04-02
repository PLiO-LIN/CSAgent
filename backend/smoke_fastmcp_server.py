from mcp.server import FastMCP

app = FastMCP("smoke-fastmcp")


@app.tool(name="ping")
def ping(text: str = "pong") -> str:
    return f"ping:{text}"


@app.tool(name="add")
def add(a: int, b: int) -> dict:
    return {"sum": int(a) + int(b), "a": int(a), "b": int(b)}


@app.tool(name="make_note")
def make_note(title: str, body: str) -> dict:
    return {"title": title, "body": body, "preview": f"{title}: {body[:40]}"}


if __name__ == "__main__":
    app.run()
