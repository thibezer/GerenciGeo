import os
import sys
import logging
from logging.handlers import RotatingFileHandler
from datetime import datetime
import json

# Define the global trace log file path
LOG_DIR = os.path.join(os.getcwd(), "logs")
os.makedirs(LOG_DIR, exist_ok=True)
TRACE_LOG_FILE = os.path.join(LOG_DIR, "gerencigeo_trace.log")

class SystemTracer:
    """
    Rastreador unificado do sistema. 
    Gerencia um log físico e provê métodos injetáveis para mapear 
    o uso de rotas e manipulação de arquivos físicos e lógicos.
    """
    _logger = None

    @classmethod
    def get_logger(cls) -> logging.Logger:
        if cls._logger is None:
            logger = logging.getLogger("GerenciGeoTracer")
            logger.setLevel(logging.DEBUG)

            # File handler para manter histórico (Rotaciona quando atingir 5MB, até 3 backups)
            file_handler = RotatingFileHandler(TRACE_LOG_FILE, maxBytes=5*1024*1024, backupCount=3, encoding='utf-8')
            file_handler.setLevel(logging.DEBUG)

            # Console handler (opcional para ver no terminal)
            console_handler = logging.StreamHandler(sys.stdout)
            console_handler.setLevel(logging.INFO)

            # Formatação Padronizada
            formatter = logging.Formatter(
                fmt="[%(asctime)s] [%(levelname)s] [%(module)s] - %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S"
            )
            file_handler.setFormatter(formatter)
            console_handler.setFormatter(formatter)

            logger.addHandler(file_handler)
            logger.addHandler(console_handler)

            # Evita propagar logs para o root logger do Uvicorn se não quisermos duplicação
            logger.propagate = False
            cls._logger = logger

        return cls._logger

    @classmethod
    def trace_request(cls, method: str, url: str, client_ip: str, duration_ms: float, status_code: int):
        """Registra no log a chamada de uma Rota / Botão e seu tempo de execução."""
        logger = cls.get_logger()
        msg = f"API REQUEST | Method: {method} | URL: {url} | Status: {status_code} | Tempo: {duration_ms:.2f}ms | IP: {client_ip}"
        
        if status_code >= 400:
            logger.error(msg)
        else:
            logger.info(msg)

    @classmethod
    def trace_file_usage(cls, action: str, file_path: str, context: str = ""):
        """
        Registra no log a manipulação física (Leitura, Gravação, Exclusão) de um arquivo no HD
        action: 'READ', 'WRITE', 'DELETE', 'APPEND'
        file_path: o caminho do arquivo
        context: contexto de negócio (Ex: 'Exportação Shapefile')
        """
        logger = cls.get_logger()
        file_name = os.path.basename(file_path)
        logger.debug(f"FILE {action.upper()} | Arquivo: {file_name} | Path: {file_path} | Contexto: {context}")

    @classmethod
    def trace_code_execution(cls, module_name: str, function_name: str, message: str = ""):
        """
        Registra no log a inicialização/uso de uma lógica de código interno (Python).
        """
        logger = cls.get_logger()
        msg = f"CODE EXECUTION | Módulo: {module_name} | Função: {function_name}() | {message}"
        logger.debug(msg)

# Alias para facilitar o uso no restante do sistema
tracer = SystemTracer()
