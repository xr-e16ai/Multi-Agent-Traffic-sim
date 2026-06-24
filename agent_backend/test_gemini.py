# test_gemini.py

from dotenv import load_dotenv
load_dotenv()

from google import genai

client = genai.Client()

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="Hello"
)

print(response.text)