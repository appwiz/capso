use ffmpeg::filter;
use flume::{Receiver, Sender};

use crate::{
    data::{AudioInfo, FFAudio},
    pipeline::task::PipelinePipeTask,
    MediaError,
};

pub struct AudioFilter {
    tag: &'static str,
    filter_graph: filter::Graph,
}

impl AudioFilter {
    pub fn init(
        tag: &'static str,
        input_config: AudioInfo,
        output_config: AudioInfo,
    ) -> Result<Self, MediaError> {
        let mut filter_graph = filter::Graph::new();

        let input_args = format!(
            "time_base={}:sample_rate={}:sample_fmt={}:channel_layout=0x{:x}",
            input_config.time_base,
            input_config.rate(),
            input_config.sample_format.name(),
            input_config.channel_layout().bits(),
        );
        filter_graph.add(&filter::find("abuffer").unwrap(), "in", &input_args)?;
        filter_graph.add(&filter::find("abuffersink").unwrap(), "out", "")?;

        // let mut output = filter_graph.get("out").unwrap();
        // output.sink().set_frame_size(2048);

        let spec = format!(
            "aformat=sample_fmts={}:sample_rates={}:channel_layouts=0x{}",
            output_config.sample_format.name(),
            output_config.rate(),
            output_config.channel_layout().bits(),
        );

        filter_graph
            .output("in", 0)?
            .input("out", 0)?
            .parse(&spec)?;
        filter_graph.validate()?;

        Ok(Self { filter_graph, tag })
    }

    fn queue_frame(&mut self, frame: FFAudio) {
        self.filter_graph
            .get("in")
            .unwrap()
            .source()
            .add(&frame)
            .unwrap();
    }

    fn process_frame(&mut self, output: &Sender<FFAudio>) {
        let mut filtered_frame = FFAudio::empty();

        while self
            .filter_graph
            .get("out")
            .unwrap()
            .sink()
            .frame(&mut filtered_frame)
            .is_ok()
        {
            output.send(filtered_frame).unwrap();
            filtered_frame = FFAudio::empty();
        }
    }

    fn finish(&mut self, output: &Sender<FFAudio>) {
        self.filter_graph
            .get("in")
            .unwrap()
            .source()
            .flush()
            .unwrap();

        self.process_frame(output);
    }
}

impl PipelinePipeTask for AudioFilter {
    type Input = FFAudio;
    type Output = FFAudio;

    fn run(
        &mut self,
        ready_signal: crate::pipeline::task::PipelineReadySignal,
        input: Receiver<Self::Input>,
        output: Sender<Self::Output>,
    ) {
        ready_signal.send(Ok(())).unwrap();

        while let Ok(raw_frame) = input.recv() {
            self.queue_frame(raw_frame);
            self.process_frame(&output);
        }

        self.finish(&output);
    }
}
