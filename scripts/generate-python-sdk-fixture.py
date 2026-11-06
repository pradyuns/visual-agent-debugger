import json
from agents.tracing import trace, agent_span, generation_span, function_span, handoff_span, set_trace_processors

# Construct sample data locally; no agent/model is run and no exporter is configured.
set_trace_processors([])
with trace('SDK fixture', trace_id='trace_fixture', group_id='group_fixture', metadata={'environment': 'test'}) as run:
    with agent_span('Triage', span_id='span_agent') as agent:
        with generation_span(input=[{'role': 'user', 'content': 'Hello'}], output=[{'role': 'assistant', 'content': 'Hi'}], model='example-model', usage={'input_tokens': 12, 'output_tokens': 4}, span_id='span_generation') as generation:
            pass
        with function_span('lookup', input='question', output='answer', span_id='span_function') as function:
            function.set_error({'message': 'example error', 'data': {'fixture': True}})
        with handoff_span(from_agent='Triage', to_agent='Billing', span_id='span_handoff') as handoff:
            pass
records = [item.export() for item in (run, agent, generation, function, handoff)]
assert all(record is not None for record in records)
print(json.dumps({'data': records}, indent=2))
