"""Valida tests/out/remesa.xml contra el esquema oficial pain.008.001.02 (incluido en el paquete sepaxml)."""
import os, sys
import sepaxml
from lxml import etree

xsd = os.path.join(os.path.dirname(sepaxml.__file__), 'schemas', 'pain.008.001.02.xsd')
schema = etree.XMLSchema(etree.parse(xsd))
doc = etree.parse('tests/out/remesa.xml')
if not schema.validate(doc):
    print(schema.error_log)
    sys.exit(1)
print('remesa.xml valida contra pain.008.001.02')
