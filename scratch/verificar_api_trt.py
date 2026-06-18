import requests

try:
    res = requests.get("http://127.0.0.1:8000/levantamentos")
    data = res.json()
    print("API Response items:")
    for item in data:
        if item.get("id") == 11:
            print(f"ID 11 -> numero_trt: {item.get('numero_trt')}, data_trt: {item.get('data_trt')}")
        else:
            print(f"ID {item.get('id')} -> numero_trt: {item.get('numero_trt')}, data_trt: {item.get('data_trt')}")
except Exception as e:
    print("Error:", e)
