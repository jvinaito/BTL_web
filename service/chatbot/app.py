from flask import Flask, request, jsonify
from flask_cors import CORS
from chatbot import process_message
import logging

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)


@app.route('/health', methods=['GET'])
def health():
    """Health-check endpoint for monitoring."""
    return jsonify({'status': 'ok'}), 200


@app.route('/chat', methods=['POST'])
def chat():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Request body phải là JSON hợp lệ.'}), 400

    msg = data.get('message', '').strip()
    if not msg:
        return jsonify({'error': 'Tin nhắn không được để trống.'}), 400

    if len(msg) > 500:
        return jsonify({'error': 'Tin nhắn quá dài (tối đa 500 ký tự).'}), 400

    try:
        reply = process_message(msg)
        logger.info('msg=%r reply=%r', msg[:80], reply[:80])
        return jsonify({'reply': reply})
    except Exception as e:
        logger.exception('Lỗi xử lý tin nhắn: %s', e)
        return jsonify({'error': 'Lỗi nội bộ. Vui lòng thử lại sau.'}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=False)